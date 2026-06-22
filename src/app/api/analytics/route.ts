import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/analytics
// Returns analytics data: most-cited chunks, chat question frequency,
// top projects, and activity over time.

interface CitationRef {
  chunkId: string
  sourcePath: string
  headingPath: string
  chunkIndex: number
}

export async function GET() {
  // Gather all assistant messages with their citations
  const assistantMessages = await db.chatMessage.findMany({
    where: { role: "assistant" },
    select: { content: true, citations: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

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

  // User messages = questions asked
  const userMessages = await db.chatMessage.findMany({
    where: { role: "user" },
    select: { content: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

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

  // Top projects by note count + decision count
  const notesByProject = await db.note.groupBy({
    by: ["project"],
    _count: true,
  })
  const decisionsByProject = await db.decision.groupBy({
    by: ["project"],
    _count: true,
  })

  const projectStats = notesByProject.map((n) => ({
    project: n.project,
    notes: n._count,
    decisions: decisionsByProject.find((d) => d.project === n.project)?._count ?? 0,
  }))

  // Summary stats
  const totalCitations = Array.from(citationCounts.values()).reduce((a, b) => a + b, 0)
  const totalQuestions = userMessages.length
  const avgCitationsPerAnswer = assistantMessages.length > 0
    ? Number((totalCitations / assistantMessages.length).toFixed(1))
    : 0

  return NextResponse.json({
    mostCitedChunks,
    recentQuestions,
    questionActivity,
    projectStats,
    summary: {
      totalQuestions,
      totalAnswers: assistantMessages.length,
      totalCitations,
      avgCitationsPerAnswer,
      uniqueCitedChunks: citationCounts.size,
    },
  })
}
