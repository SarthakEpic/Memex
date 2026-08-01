import { db } from "@/lib/db"
import {
  analyzeInboxEmailContentBatch,
  triageInboxEmailMetadataBatch,
  type InboxContentAnalysis,
  type InboxMetadataTriage,
} from "@/server/email/ai-batch"

const GLOBAL_AI_SLOT_MS = 20_000
const METADATA_BATCH_SIZE = 8
const CONTENT_BATCH_SIZE = 3
const MAX_ATTEMPTS = 4
const STALE_LOCK_MS = 5 * 60_000

type InboxCandidate = {
  id: string
  fromAddress: string
  fromName: string
  subject: string
  body: string
  isRead: boolean
  isStarred: boolean
  receivedAt: Date
}

export type LocalInboxClassification = {
  category: "newsletter" | "normal"
  action: "review" | "archive"
  summary: string
  triageScore: number
  final: boolean
}

export type InboxAnalysisRun = {
  processed: number
  completed: number
  deferred: number
  skipped: number
}

const URGENT_SUBJECT_PATTERN = /\b(urgent|asap|action required|deadline|due (?:today|tomorrow)|overdue|payment (?:due|failed)|invoice|security alert|verify (?:your )?account|password|suspicious|meeting (?:today|tomorrow)|interview)\b/i
const NEWSLETTER_SUBJECT_PATTERN = /\b(newsletter|digest|weekly|monthly|roundup|unsubscribe|offers?|sale|promotion|marketing)\b/i
const RECEIPT_SUBJECT_PATTERN = /\b(receipt|order (?:confirmation|shipped)|invoice paid|payment (?:received|successful)|otp|one[- ]time passcode|verification code)\b/i
const AUTOMATED_SENDER_PATTERN = /(?:^|[-_.])(no-?reply|donotreply|notifications?|mailer-daemon|updates?)(?:[-_.]|@|$)/i

/**
 * Score only sender/subject/flags. The body is intentionally not needed here:
 * the score decides whether a later, bounded content inspection is justified.
 */
export function classifyInboxEmailLocally(email: Omit<InboxCandidate, "id" | "body" | "receivedAt"> & { receivedAt?: Date }): LocalInboxClassification {
  const sender = `${email.fromName} ${email.fromAddress}`.trim()
  const subject = email.subject.trim() || "(no subject)"
  const automated = AUTOMATED_SENDER_PATTERN.test(sender)
  const likelyCampaignSender = automated || /\b(?:newsletter|updates?|marketing|news)\b/i.test(sender)
  const newsletter = NEWSLETTER_SUBJECT_PATTERN.test(subject)
  const receipt = RECEIPT_SUBJECT_PATTERN.test(subject)
  const urgent = URGENT_SUBJECT_PATTERN.test(subject)

  let triageScore = 18
  if (!email.isRead) triageScore += 24
  if (email.isStarred) triageScore += 24
  if (!automated) triageScore += 8
  if (urgent) triageScore += 48
  if (newsletter) triageScore -= 50
  if (receipt) triageScore -= 22
  triageScore = Math.max(0, Math.min(100, triageScore))

  if (newsletter && likelyCampaignSender && !urgent) {
    return {
      category: "newsletter",
      action: "archive",
      summary: `Newsletter: ${subject}`,
      triageScore,
      final: true,
    }
  }

  if (receipt && likelyCampaignSender && !urgent) {
    return {
      category: "normal",
      action: "review",
      summary: `Automated notice: ${subject}`,
      triageScore,
      final: true,
    }
  }

  return {
    category: "normal",
    action: "review",
    summary: "",
    triageScore,
    final: false,
  }
}

export async function enqueueInboxAnalysis(userId: string, emailIds: string[]): Promise<{ queued: number; classifiedLocally: number }> {
  const uniqueIds = Array.from(new Set(emailIds)).slice(0, 100)
  if (uniqueIds.length === 0) return { queued: 0, classifiedLocally: 0 }

  const emails = await db.inboxEmail.findMany({
    where: { userId, id: { in: uniqueIds }, analyzed: false },
    select: {
      id: true,
      fromAddress: true,
      fromName: true,
      subject: true,
      isRead: true,
      isStarred: true,
    },
  })

  let queued = 0
  let classifiedLocally = 0
  const now = new Date()

  for (const email of emails) {
    const local = classifyInboxEmailLocally(email)
    if (local.final) {
      await db.inboxEmail.updateMany({
        where: { id: email.id, userId, analyzed: false },
        data: {
          category: local.category,
          action: local.action,
          summary: local.summary,
          analyzed: true,
          analysisState: "local",
          triageScore: local.triageScore,
        },
      })
      classifiedLocally++
      continue
    }

    await db.inboxEmail.updateMany({
      where: { id: email.id, userId, analyzed: false },
      data: { analysisState: "queued", triageScore: local.triageScore },
    })
    await db.emailAnalysisJob.upsert({
      where: { emailId: email.id },
      create: {
        userId,
        emailId: email.id,
        stage: "metadata",
        status: "queued",
        priority: local.triageScore,
        runAfter: now,
      },
      update: {},
    })
    queued++
  }

  return { queued, classifiedLocally }
}

/** Process at most one small model batch by default. Safe to call from a cron job or Next `after`. */
export async function processInboxAnalysisQueue(options: { userId?: string; maxBatches?: number } = {}): Promise<InboxAnalysisRun> {
  const result: InboxAnalysisRun = { processed: 0, completed: 0, deferred: 0, skipped: 0 }
  const maxBatches = Math.max(1, Math.min(options.maxBatches ?? 1, 2))

  await recoverStaleJobs()

  for (let index = 0; index < maxBatches; index++) {
    const stage = await nextReadyStage(options.userId)
    if (!stage) break
    if (!(await reserveInboxAiSlot())) break
    const claimed = await claimReadyJobs(stage, options.userId)
    if (claimed.length === 0) break

    result.processed += claimed.length
    const emails = await db.inboxEmail.findMany({
      where: { id: { in: claimed.map((job) => job.emailId) }, userId: options.userId },
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        subject: true,
        body: true,
        isRead: true,
        isStarred: true,
        receivedAt: true,
      },
    })
    const byId = new Map(emails.map((email) => [email.id, email]))
    const usable = claimed
      .map((job) => ({ job, email: byId.get(job.emailId) }))
      .filter((entry): entry is { job: typeof claimed[number]; email: InboxCandidate } => Boolean(entry.email))

    const missing = claimed.filter((job) => !byId.has(job.emailId))
    if (missing.length > 0) {
      await db.emailAnalysisJob.updateMany({
        where: { id: { in: missing.map((job) => job.id) } },
        data: { status: "completed", lastError: "Email no longer exists", lockedAt: null },
      })
      result.skipped += missing.length
    }
    if (usable.length === 0) continue

    if (stage === "metadata") {
      const response = await triageInboxEmailMetadataBatch(
        usable.map(({ email }) => ({
          id: email.id,
          fromAddress: email.fromAddress,
          fromName: email.fromName,
          subject: email.subject,
          receivedAt: email.receivedAt.toISOString(),
          isRead: email.isRead,
          isStarred: email.isStarred,
        }))
      )
      const handled = await applyMetadataResponse(usable, response.items)
      if (!response.ok) {
        await deferJobs(usable.map(({ job }) => job.id), response.error, response.retryAfterMs)
        result.deferred += usable.length
      } else {
        result.completed += handled.completed
      }
      continue
    }

    const response = await analyzeInboxEmailContentBatch(
      usable.map(({ email }) => ({
        id: email.id,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        subject: email.subject,
        body: email.body.slice(0, 1_400),
        receivedAt: email.receivedAt.toISOString(),
      }))
    )
    if (!response.ok) {
      await deferJobs(usable.map(({ job }) => job.id), response.error, response.retryAfterMs)
      result.deferred += usable.length
    } else {
      result.completed += await applyContentResponse(usable, response.items)
    }
  }

  return result
}

async function nextReadyStage(userId?: string): Promise<"content" | "metadata" | null> {
  const now = new Date()
  for (const stage of ["content", "metadata"] as const) {
    const job = await db.emailAnalysisJob.findFirst({
      where: {
        ...(userId ? { userId } : {}),
        stage,
        status: { in: ["queued", "deferred"] },
        runAfter: { lte: now },
      },
      select: { id: true },
      orderBy: [{ priority: "desc" }, { runAfter: "asc" }],
    })
    if (job) return stage
  }
  return null
}

async function claimReadyJobs(stage: "content" | "metadata", userId?: string) {
  const now = new Date()
  const candidates = await db.emailAnalysisJob.findMany({
    where: {
      ...(userId ? { userId } : {}),
      stage,
      status: { in: ["queued", "deferred"] },
      runAfter: { lte: now },
    },
    orderBy: [{ priority: "desc" }, { runAfter: "asc" }],
    take: stage === "metadata" ? METADATA_BATCH_SIZE : CONTENT_BATCH_SIZE,
  })

  const claimed = [] as typeof candidates
  for (const candidate of candidates) {
    const update = await db.emailAnalysisJob.updateMany({
      where: {
        id: candidate.id,
        stage,
        status: { in: ["queued", "deferred"] },
        runAfter: { lte: now },
      },
      data: { status: "processing", lockedAt: now },
    })
    if (update.count === 1) claimed.push(candidate)
  }
  return claimed
}

async function applyMetadataResponse(
  entries: Array<{ job: { id: string; emailId: string; priority: number }; email: InboxCandidate }>,
  items: InboxMetadataTriage[]
): Promise<{ completed: number }> {
  const byId = new Map(items.map((item) => [item.id, item]))
  let completed = 0
  const now = new Date()

  for (const { job, email } of entries) {
    const item = byId.get(email.id)
    if (!item) {
      await deferJobs([job.id], "Model did not return this metadata record")
      continue
    }
    const category = normalizeCategory(item.category)
    const action = normalizeAction(item.action)
    if (item.needsBody) {
      await db.$transaction([
        db.inboxEmail.updateMany({
          where: { id: email.id },
          data: { category, action, analysisState: "queued" },
        }),
        db.emailAnalysisJob.update({
          where: { id: job.id },
          data: {
            stage: "content",
            status: "queued",
            priority: Math.max(job.priority, category === "urgent" ? 100 : category === "important" ? 80 : 35),
            runAfter: now,
            lockedAt: null,
            lastError: "",
          },
        }),
      ])
      continue
    }

    await db.$transaction([
      db.inboxEmail.updateMany({
        where: { id: email.id },
        data: {
          category,
          action,
          summary: `Classified from sender and subject: ${email.subject}`,
          analyzed: true,
          analysisState: "metadata",
        },
      }),
      db.emailAnalysisJob.update({
        where: { id: job.id },
        data: { status: "completed", lockedAt: null, lastError: "" },
      }),
    ])
    completed++
  }
  return { completed }
}

async function applyContentResponse(
  entries: Array<{ job: { id: string; emailId: string }; email: InboxCandidate }>,
  items: InboxContentAnalysis[]
): Promise<number> {
  const byId = new Map(items.map((item) => [item.id, item]))
  let completed = 0
  for (const { job, email } of entries) {
    const item = byId.get(email.id)
    if (!item) {
      await deferJobs([job.id], "Model did not return this content record")
      continue
    }
    await db.$transaction([
      db.inboxEmail.updateMany({
        where: { id: email.id },
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
      db.emailAnalysisJob.update({
        where: { id: job.id },
        data: { status: "completed", lockedAt: null, lastError: "" },
      }),
    ])
    completed++
  }
  return completed
}

async function deferJobs(ids: string[], error?: string, retryAfterMs?: number): Promise<void> {
  const jobs = await db.emailAnalysisJob.findMany({ where: { id: { in: ids } }, select: { id: true, attempts: true, emailId: true } })
  const retryMs = Math.max(retryAfterMs ?? 60_000, 20_000)
  await Promise.all(jobs.map(async (job) => {
    const attempts = job.attempts + 1
    const failed = attempts >= MAX_ATTEMPTS
    await db.$transaction([
      db.emailAnalysisJob.update({
        where: { id: job.id },
        data: {
          attempts,
          status: failed ? "failed" : "deferred",
          runAfter: new Date(Date.now() + retryMs * Math.min(attempts, 4)),
          lockedAt: null,
          lastError: (error || "AI analysis could not be completed").slice(0, 500),
        },
      }),
      db.inboxEmail.updateMany({
        where: { id: job.emailId, analyzed: false },
        data: { analysisState: failed ? "failed" : "deferred" },
      }),
    ])
  }))
}

async function recoverStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS)
  await db.emailAnalysisJob.updateMany({
    where: { status: "processing", lockedAt: { lt: cutoff } },
    data: { status: "deferred", runAfter: new Date(), lockedAt: null, lastError: "Recovered after an interrupted worker" },
  })
}

/** A database-backed lease makes the pace shared across users and server instances. */
export async function reserveInboxAiSlot(): Promise<boolean> {
  const key = "ai:email-analysis:global-slot"
  const now = new Date()
  const resetAt = new Date(now.getTime() + GLOBAL_AI_SLOT_MS)

  try {
    await db.rateLimitBucket.create({ data: { key, count: 1, resetAt } })
    return true
  } catch {
    const claimed = await db.rateLimitBucket.updateMany({
      where: { key, resetAt: { lte: now } },
      data: { count: 1, resetAt },
    })
    return claimed.count === 1
  }
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
