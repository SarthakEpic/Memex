import { db } from "@/lib/db"
import { analyzeInboxEmailContentBatch } from "@/server/email/ai-batch"
import { reserveInboxAiSlot } from "@/server/email/analysis-pipeline"

type InboxMetadata = {
  id: string
  fromAddress: string
  fromName: string
  subject: string
  category: string
  summary: string
  analyzed: boolean
  analysisState: string
  triageScore: number
  isRead: boolean
  isStarred: boolean
  receivedAt: Date
}

const STOP_WORDS = new Set(["the", "a", "an", "my", "mail", "email", "emails", "inbox", "check", "show", "tell", "me", "about", "with", "that", "this", "from", "for", "and", "any", "are", "what", "have", "got"])

export function isInboxReviewQuestion(message: string): boolean {
  const text = message.toLowerCase()
  if (!/\b(?:email|emails|mail|inbox|message|messages)\b/.test(text)) return false
  return /\b(?:important|urgent|priority|action|reply|review|check|summari[sz]e|details?|what(?:'s| is)|which)\b/.test(text)
}

export function rankInboxCandidates(question: string, emails: InboxMetadata[]): InboxMetadata[] {
  const terms = question.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((term) => !STOP_WORDS.has(term)) ?? []
  const now = Date.now()

  return emails
    .map((email) => {
      const haystack = `${email.fromName} ${email.fromAddress} ${email.subject}`.toLowerCase()
      const categoryScore = email.category === "urgent" ? 70 : email.category === "important" ? 50 : email.category === "newsletter" ? -35 : 0
      const termScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 18 : 0), 0)
      const recencyHours = Math.max(0, (now - email.receivedAt.getTime()) / 3_600_000)
      const recencyScore = recencyHours < 24 ? 12 : recencyHours < 72 ? 6 : 0
      const score = email.triageScore + categoryScore + termScore + recencyScore + (email.isRead ? 0 : 20) + (email.isStarred ? 18 : 0)
      return { email, score }
    })
    .sort((a, b) => b.score - a.score || b.email.receivedAt.getTime() - a.email.receivedAt.getTime())
    .slice(0, 3)
    .map(({ email }) => email)
}

export async function reviewInboxQuestion(userId: string, question: string): Promise<{ answer: string; serviceError: boolean; inspectedBodies: number }> {
  const metadata = await db.inboxEmail.findMany({
    where: { userId, isArchived: false },
    select: {
      id: true,
      fromAddress: true,
      fromName: true,
      subject: true,
      category: true,
      summary: true,
      analyzed: true,
      analysisState: true,
      triageScore: true,
      isRead: true,
      isStarred: true,
      receivedAt: true,
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  })
  const candidates = rankInboxCandidates(question, metadata)
  if (candidates.length === 0) {
    return { answer: "I could not find any emails in your inbox to review.", serviceError: false, inspectedBodies: 0 }
  }

  const needsContent = candidates.filter((email) => !email.analyzed || email.analysisState === "metadata" || email.analysisState === "queued" || email.analysisState === "deferred")
  let inspectedBodies = 0
  let serviceError = false

  if (needsContent.length > 0 && await reserveInboxAiSlot()) {
    const bodies = await db.inboxEmail.findMany({
      where: { userId, id: { in: needsContent.map((email) => email.id) } },
      select: { id: true, fromAddress: true, fromName: true, subject: true, body: true, receivedAt: true },
    })
    const result = await analyzeInboxEmailContentBatch(
      bodies.map((email) => ({
        ...email,
        body: email.body.slice(0, 1_400),
        receivedAt: email.receivedAt.toISOString(),
      }))
    )
    if (result.ok) {
      inspectedBodies = bodies.length
      await Promise.all(result.items.map((item) =>
        db.$transaction([
          db.inboxEmail.updateMany({
            where: { id: item.id, userId },
            data: {
              category: normalizeCategory(item.category),
              action: normalizeAction(item.action),
              summary: item.summary.slice(0, 500),
              keyPoints: JSON.stringify(item.keyPoints.slice(0, 5)),
              suggestedReply: item.suggestedReply.slice(0, 4_000),
              analyzed: true,
              analysisState: "analyzed",
            },
          }),
          db.emailAnalysisJob.updateMany({
            where: { emailId: item.id },
            data: { status: "completed", lockedAt: null, lastError: "" },
          }),
        ])
      ))
    } else {
      serviceError = true
    }
  }

  const refreshed = await db.inboxEmail.findMany({
    where: { userId, id: { in: candidates.map((email) => email.id) } },
    select: { id: true, fromAddress: true, fromName: true, subject: true, summary: true, category: true, analysisState: true, receivedAt: true },
  })
  const byId = new Map(refreshed.map((email) => [email.id, email]))
  const lines = candidates.map((candidate) => {
    const email = byId.get(candidate.id)
    const sender = email?.fromName || email?.fromAddress || candidate.fromName || candidate.fromAddress
    const summary = email?.summary || "Queued for detailed review."
    return `- **${sender}** — ${candidate.subject}\n  ${summary}`
  })
  const lead = inspectedBodies > 0
    ? `I screened ${metadata.length} headers first and read the content of ${inspectedBodies} relevant email${inspectedBodies === 1 ? "" : "s"}.`
    : `I screened ${metadata.length} headers and selected the most relevant emails.`
  const note = needsContent.length > 0 && inspectedBodies === 0
    ? " Detailed content review is queued, so this result currently uses local metadata and saved summaries."
    : ""
  return { answer: `${lead}${note}\n\n${lines.join("\n\n")}`, serviceError, inspectedBodies }
}

function normalizeCategory(value: string): "urgent" | "important" | "normal" | "newsletter" | "spam" {
  return ["urgent", "important", "normal", "newsletter", "spam"].includes(value)
    ? value as "urgent" | "important" | "normal" | "newsletter" | "spam"
    : "normal"
}

function normalizeAction(value: string): "reply_needed" | "review" | "archive" | "unsubscribe" {
  return ["reply_needed", "review", "archive", "unsubscribe"].includes(value)
    ? value as "reply_needed" | "review" | "archive" | "unsubscribe"
    : "review"
}
