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
  const assistantMessages = await db.chatMessage.findMany({
    where: { role: "assistant" },
    select: { citations: true },
  })
  const citedMessages = assistantMessages.filter((m) => {
    try {
      const c = JSON.parse(m.citations)
      return Array.isArray(c) && c.length > 0
    } catch {
      return false
    }
  }).length
  const citationCoverage =
    assistantMessages.length > 0
      ? Math.round((citedMessages / assistantMessages.length) * 100)
      : 0

  // Refusal rate: % of assistant messages that refused
  const refusals = assistantMessages.filter((m) => {
    try {
      const c = JSON.parse(m.citations)
      return Array.isArray(c) && c.length === 0
    } catch {
      return true
    }
  }).length
  const refusalRate =
    assistantMessages.length > 0
      ? Math.round((refusals / assistantMessages.length) * 100)
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
