import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// GET /api/analytics
// Returns analytics data: most-cited chunks, chat question frequency,
// top projects, and activity over time.

interface CitationRef {
  chunkId: string
  sourcePath: string
  headingPath: string
  chunkIndex: number
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const [assistantMessages, userMessages, totalQuestions, totalAnswers, notesByProject, decisionsByProject] =
    await Promise.all([
      // Citation analytics currently read stored citation JSON because it is not normalized.
      db.chatMessage.findMany({
    where: { role: "assistant", userId: auth.user.id },
        select: { citations: true },
        orderBy: { createdAt: "asc" },
      }),
      db.chatMessage.findMany({
        where: { role: "user", userId: auth.user.id },
        select: { content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.chatMessage.count({ where: { role: "user", userId: auth.user.id } }),
      db.chatMessage.count({ where: { role: "assistant", userId: auth.user.id } }),
      db.note.groupBy({
        by: ["project"],
        where: { userId: auth.user.id },
        _count: true,
      }),
      db.decision.groupBy({
        by: ["project"],
        where: { userId: auth.user.id },
        _count: true,
      }),
    ])

  // Count citation frequency per chunkId
  const citationCounts = new Map<string, number>()
  const citationMeta = new Map<string, CitationRef>()
  for (const m of assistantMessages) {
    try {
      const cites = JSON.parse(m.citations) as CitationRef[]
      if (Array.isArray(cites)) {
        for (const c of cites) {
          citationCounts.set(c.chunkId, (citationCounts.get(c.chunkId) ?? 0) + 1)
          citationMeta.set(c.chunkId, c)
        }
      }
    } catch {
      // skip
    }
  }

  const mostCitedChunks = Array.from(citationCounts.entries())
    .map(([chunkId, count]) => ({ ...citationMeta.get(chunkId)!, chunkId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)


  // Recent questions (last 10)
  const recentQuestions = userMessages.slice(0, 10).map((m) => ({
    question: m.content.slice(0, 120),
    timestamp: m.createdAt.toISOString(),
  }))

  // Question frequency by day (last 14 days)
  const dayBuckets = new Map<string, number>()
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dayBuckets.set(key, 0)
  }
  for (const m of userMessages) {
    const key = m.createdAt.toISOString().slice(0, 10)
    if (dayBuckets.has(key)) {
      dayBuckets.set(key, dayBuckets.get(key)! + 1)
    }
  }
  const questionActivity = Array.from(dayBuckets.entries()).map(([date, count]) => ({
    date,
    count,
  }))

  // Include projects that currently contain only decisions as well as note-backed projects.
  const projects = new Set([
    ...notesByProject.map((entry) => entry.project),
    ...decisionsByProject.map((entry) => entry.project),
  ])
  const projectStats = Array.from(projects)
    .map((project) => ({
      project,
      notes: notesByProject.find((entry) => entry.project === project)?._count ?? 0,
      decisions: decisionsByProject.find((entry) => entry.project === project)?._count ?? 0,
    }))
    .sort((a, b) => b.notes + b.decisions - (a.notes + a.decisions))

  // Summary stats
  const totalCitations = Array.from(citationCounts.values()).reduce((a, b) => a + b, 0)
  const avgCitationsPerAnswer = totalAnswers > 0
    ? Number((totalCitations / totalAnswers).toFixed(1))
    : 0

  return NextResponse.json({
    mostCitedChunks,
    recentQuestions,
    questionActivity,
    projectStats,
    summary: {
      totalQuestions,
      totalAnswers,
      totalCitations,
      avgCitationsPerAnswer,
      uniqueCitedChunks: citationCounts.size,
    },
  })
}
