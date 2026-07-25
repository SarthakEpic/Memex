import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { corpusStats } from "@/lib/retrieval"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { serverError } from "@/server/observability/api-error"

// GET /api/stats — dashboard + retrieval-health metrics
export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  try {
    const [
      notes,
      decisions,
      sessions,
      messages,
      emails,
      corpus,
      emailsDelivered,
      emailsBySource,
      decisionsByProject,
      notesByProject,
      assistantMessages,
    ] = await Promise.all([
      db.note.count({ where: { userId: auth.user.id } }),
      db.decision.count({ where: { userId: auth.user.id } }),
      db.chatSession.count({ where: { userId: auth.user.id } }),
      db.chatMessage.count({ where: { role: "user", userId: auth.user.id } }),
      db.email.count({ where: { userId: auth.user.id } }),
      corpusStats(auth.user.id),
      db.email.count({ where: { status: "delivered", userId: auth.user.id } }),
      db.email.groupBy({
        by: ["sourceType"],
        where: { userId: auth.user.id },
        _count: true,
      }),
      db.decision.groupBy({
        by: ["project"],
        where: { userId: auth.user.id },
        _count: true,
      }),
      db.note.groupBy({
        by: ["project"],
        where: { userId: auth.user.id },
        _count: true,
      }),
      db.chatMessage.findMany({
        where: { role: "assistant", userId: auth.user.id },
        select: { content: true, citations: true },
      }),
    ])

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
  } catch (error) {
    return serverError(error, { route: "GET /api/stats" })
  }
}
