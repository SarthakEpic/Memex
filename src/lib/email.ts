// Email integration — simulated SMTP.
// Emails are stored in the DB with a status pipeline (queued → sent → delivered).
// A real SMTP transport could be dropped in behind sendEmail() without
// changing the rest of the app.

import { db } from "@/lib/db"
import { markdownToHtml } from "@/lib/markdown"

export interface SendEmailInput {
  toAddress: string
  subject: string
  bodyMarkdown: string
  sourceType?: "manual" | "chat" | "decision" | "note" | "digest"
  sourceId?: string
  fromName?: string
}

export interface SendEmailResult {
  id: string
  status: string
  delivered: boolean
}

// Simulate SMTP delivery: render HTML, mark as sent + delivered.
// In production this would call nodemailer / SES / etc.
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const bodyHtml = await markdownToHtml(input.bodyMarkdown)
  const email = await db.email.create({
    data: {
      toAddress: input.toAddress,
      fromName: input.fromName ?? "Memex",
      subject: input.subject,
      bodyMarkdown: input.bodyMarkdown,
      bodyHtml,
      status: "queued",
      sourceType: input.sourceType ?? "manual",
      sourceId: input.sourceId ?? "",
    },
  })

  // Simulate network delivery latency + occasional success.
  // We always succeed in this sandbox, but the pipeline is real.
  const now = new Date()
  await db.email.update({
    where: { id: email.id },
    data: { status: "delivered", sentAt: now, deliveredAt: now },
  })

  return { id: email.id, status: "delivered", delivered: true }
}

// Build a daily digest email body from recent decisions + unanswered questions.
export async function buildDigestBody(): Promise<{
  subject: string
  bodyMarkdown: string
  hasContent: boolean
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentDecisions = await db.decision.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { note: true },
  })
  const recentQuestions = await db.chatMessage.findMany({
    where: { role: "user", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  if (recentDecisions.length === 0 && recentQuestions.length === 0) {
    return {
      subject: "Memex Daily Digest",
      bodyMarkdown: "_No new activity in the last 24 hours._",
      hasContent: false,
    }
  }

  const lines: string[] = []
  lines.push(`# Memex Daily Digest`)
  lines.push("")
  lines.push(`_Generated ${new Date().toLocaleString()}_`)
  lines.push("")

  if (recentDecisions.length > 0) {
    lines.push(`## Recent Decisions (${recentDecisions.length})`)
    lines.push("")
    for (const d of recentDecisions) {
      lines.push(`### ${d.title}`)
      if (d.decisionDate) lines.push(`**Decided:** ${d.decisionDate}  `)
      lines.push(`**Rationale:** ${d.rationale}  `)
      if (d.alternatives) lines.push(`**Alternatives:** ${d.alternatives.replace(/\|/g, ", ")}  `)
      lines.push(`_Source: ${d.note.sourcePath}_`)
      lines.push("")
    }
  }

  if (recentQuestions.length > 0) {
    lines.push(`## Recent Questions (${recentQuestions.length})`)
    lines.push("")
    for (const q of recentQuestions) {
      lines.push(`- ${q.content.slice(0, 160)}`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("_Sent by Memex · citation-first knowledge retrieval_")

  return {
    subject: `Memex Digest — ${recentDecisions.length} decisions, ${recentQuestions.length} questions`,
    bodyMarkdown: lines.join("\n"),
    hasContent: true,
  }
}
