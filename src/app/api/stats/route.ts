import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { corpusStats } from "@/lib/retrieval"

// GET /api/stats — dashboard + retrieval-health metrics
export async function GET() {
  const [notes, decisions, sessions, messages, emails, corpus] = await Promise.all([
    db.note.count(),
    db.decision.count(),
    db.chatSession.count(),
    db.chatMessage.count({ where: { role: "user" } }),
    db.email.count(),
    corpusStats(),
  ])

  const emailsDelivered = await db.email.count({ where: { status: "delivered" } })
  const emailsBySource = await db.email.groupBy({
    by: ["sourceType"],
    _count: true,
  })

  const decisionsByProject = await db.decision.groupBy({
    by: ["project"],
    _count: true,
  })

  const notesByProject = await db.note.groupBy({
    by: ["project"],
    _count: true,
  })

  // Citation coverage: % of assistant messages with at least one citation
  // Only count messages that are NOTE Q&A (not greetings, app help, or general chat)
  const assistantMessages = await db.chatMessage.findMany({
    where: { role: "assistant" },
    select: { content: true, citations: true },
  })

  // A message is a "note answer" if it contains citation markers [^...]
  // or if it explicitly says "I don't have a source" (honest refusal)
  const noteAnswers = assistantMessages.filter((m) => {
    const content = m.content.toLowerCase()
    return (
      content.includes("[^") || // has citations
      content.includes("i don't have a source") || // honest refusal
      content.includes("i don't have a source for this in your notes") // note-specific refusal
    )
  })

  const citedMessages = noteAnswers.filter((m) => {
    try {
      const c = JSON.parse(m.citations)
      return Array.isArray(c) && c.length > 0
    } catch {
      return false
    }
  }).length

  // Citation coverage = cited note answers / total note answers
  // If there are no note answers, coverage is 100% (nothing to cite = no problem)
  const citationCoverage =
    noteAnswers.length > 0
      ? Math.round((citedMessages / noteAnswers.length) * 100)
      : 100

  // Refusal rate = refusals / note answers (how often the AI couldn't find a source)
  const refusals = noteAnswers.filter((m) => {
    const content = m.content.toLowerCase()
    return (
      content.includes("i don't have a source") &&
      !content.includes("[^") // no citations = actual refusal
    )
  }).length
  const refusalRate =
    noteAnswers.length > 0
      ? Math.round((refusals / noteAnswers.length) * 100)
      : 0

  return NextResponse.json({
    counts: {
      notes,
      decisions,
      sessions,
      messages,
      emails,
      emailsDelivered,
    },
    corpus,
    citationCoverage,
    refusalRate,
    emailsBySource: emailsBySource.map((e) => ({ sourceType: e.sourceType, count: e._count })),
    decisionsByProject: decisionsByProject.map((d) => ({
      project: d.project,
      count: d._count,
    })),
    notesByProject: notesByProject.map((n) => ({ project: n.project, count: n._count })),
  })
}
