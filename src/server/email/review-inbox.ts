import { db } from "@/lib/db"
import { analyzeInboxEmailContentBatch } from "@/server/email/ai-batch"
import { enqueueInboxAnalysis } from "@/server/email/analysis-pipeline"
import { selectRelevantText } from "@/lib/relevant-text"

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

const REVIEW_HEADER_LIMIT = 300
const EXHAUSTIVE_HEADER_LIMIT = 500

const STOP_WORDS = new Set(["the", "a", "an", "my", "mail", "email", "emails", "inbox", "check", "show", "tell", "me", "about", "with", "that", "this", "from", "for", "and", "any", "are", "what", "have", "got"])

export function isInboxReviewQuestion(message: string): boolean {
  const text = message.toLowerCase()
  if (/\b(?:draft|compose|write|send|respond|reply)\b/.test(text)) return false
  if (!/\b(?:email|emails|mail|inbox|message|messages)\b/.test(text)) return false
  return /\b(?:important|urgent|priority|action|reply|review|check|summari[sz]e|details?|what(?:'s| is)|which)\b/.test(text)
}

export function rankInboxCandidates(question: string, emails: InboxMetadata[], limit = 3): InboxMetadata[] {
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
    .slice(0, limit)
    .map(({ email }) => email)
}

export async function reviewInboxQuestion(userId: string, question: string): Promise<{ answer: string; serviceError: boolean; inspectedBodies: number }> {
  const exhaustive = /\b(?:all|every|complete|full|exhaustive|find all|deadlines?)\b/i.test(question)
  const [metadata, totalAvailable] = await Promise.all([
    loadReviewMetadata(userId, question, exhaustive ? EXHAUSTIVE_HEADER_LIMIT : REVIEW_HEADER_LIMIT),
    db.inboxEmail.count({ where: { userId, isArchived: false } }),
  ])
  const candidates = rankInboxCandidates(question, metadata, exhaustive ? 8 : 5)
  if (candidates.length === 0) {
    return { answer: "I could not find any emails in your inbox to review.", serviceError: false, inspectedBodies: 0 }
  }

  const needsContent = candidates.filter((email) => !email.analyzed || email.analysisState === "metadata" || email.analysisState === "queued" || email.analysisState === "deferred")
  let inspectedBodies = 0

  if (needsContent.length > 0) {
    const selectedForReading = needsContent.slice(0, 3)
    const queuedForLater = needsContent.slice(3)
    if (queuedForLater.length > 0) {
      await enqueueInboxAnalysis(userId, queuedForLater.map((email) => email.id))
    }
    const bodies = await db.inboxEmail.findMany({
      where: { userId, id: { in: selectedForReading.map((email) => email.id) } },
      select: { id: true, fromAddress: true, fromName: true, subject: true, body: true, receivedAt: true },
    })
    const result = bodies.length > 0 ? await analyzeInboxEmailContentBatch(
      bodies.map((email) => ({
        ...email,
        body: selectRelevantText(email.body, question, 1_800).text,
        receivedAt: email.receivedAt.toISOString(),
      })),
      userId,
      "interactive"
    ) : { ok: false, items: [], error: "Selected emails are no longer available" }
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
              suggestedReply: "",
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
      await enqueueInboxAnalysis(userId, selectedForReading.map((email) => email.id))
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
  const coverage = metadata.length < totalAvailable
    ? `I searched ${metadata.length} of ${totalAvailable} synced messages using recency plus sender, subject, and body-text matches.`
    : `I searched all ${metadata.length} synced messages in this inbox view.`
  const lead = inspectedBodies > 0
    ? `${coverage} I then read ${inspectedBodies} relevant email${inspectedBodies === 1 ? "" : "s"} in detail.`
    : `${coverage} I selected the most relevant saved results from their metadata and existing analysis.`
  const remaining = Math.max(0, needsContent.length - inspectedBodies)
  const note = remaining > 0
    ? ` Detailed review for ${remaining} selected message${remaining === 1 ? " is" : "s are"} queued or waiting for AI capacity; this is a partial result.`
    : exhaustive && metadata.length < totalAvailable
      ? " This is not a complete-mailbox result because the requested scope exceeds the bounded review window."
      : ""
  return { answer: `${lead}${note}\n\n${lines.join("\n\n")}`, serviceError: false, inspectedBodies }
}

async function loadReviewMetadata(userId: string, question: string, limit: number): Promise<InboxMetadata[]> {
  const select = {
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
  } as const
  const terms = question.toLowerCase().match(/[a-z0-9@.]{3,}/g)?.filter((term) => !STOP_WORDS.has(term)).slice(0, 6) ?? []
  const recent = await db.inboxEmail.findMany({
    where: { userId, isArchived: false },
    select,
    orderBy: { receivedAt: "desc" },
    take: limit,
  })
  if (terms.length === 0) return recent
  const matched = await db.inboxEmail.findMany({
    where: {
      userId,
      isArchived: false,
      OR: terms.flatMap((term) => [
        { fromAddress: { contains: term } },
        { fromName: { contains: term } },
        { subject: { contains: term } },
        { body: { contains: term } },
      ]),
    },
    select,
    orderBy: { receivedAt: "desc" },
    take: limit,
  })
  return [...new Map([...matched, ...recent].map((email) => [email.id, email])).values()].slice(0, limit)
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
