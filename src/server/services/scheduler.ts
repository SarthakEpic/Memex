import { db } from "@/lib/db"
import { buildDigestBody, executeSend, sendEmail } from "@/lib/email"
import { deleteExpiredAuthTokens } from "@/server/auth/tokens"
import { processInboxAnalysisQueue } from "@/server/email/analysis-pipeline"

function startOfToday(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export async function processDueScheduledEmailsForAllUsers(): Promise<{
  delivered: number
  failed: number
  usersChecked: number
}> {
  const now = new Date()
  const due = await db.email.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lte: now },
    },
    select: { id: true, userId: true },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  })

  let delivered = 0
  let failed = 0
  const users = new Set<string>()

  for (const email of due) {
    users.add(email.userId)
    const result = await executeSend(email.id, email.userId)
    if (result.delivered) {
      delivered++
    } else {
      failed++
    }
  }

  return { delivered, failed, usersChecked: users.size }
}

export async function processDailyDigestsForAllUsers(): Promise<{
  created: number
  skipped: number
}> {
  const now = new Date()
  const today = startOfToday()
  const profiles = await db.profile.findMany({
    where: {
      dailyDigest: true,
      digestHour: { lte: now.getHours() },
    },
    include: { user: true },
    take: 100,
  })

  let created = 0
  let skipped = 0

  for (const profile of profiles) {
    const alreadyCreated = await db.email.findFirst({
      where: {
        userId: profile.userId,
        sourceType: "digest",
        queuedAt: { gte: today },
      },
      select: { id: true },
    })

    if (alreadyCreated) {
      skipped++
      continue
    }

    const digest = await buildDigestBody(profile.userId)
    if (!digest.hasContent) {
      skipped++
      continue
    }

    await sendEmail({
      userId: profile.userId,
      toAddress: profile.email || profile.user.email,
      fromName: "Memex",
      subject: digest.subject,
      bodyMarkdown: digest.bodyMarkdown,
      sourceType: "digest",
      isAiGenerated: true,
      requireVerification: false,
    })
    created++
  }

  return { created, skipped }
}

export async function runProductionScheduler(): Promise<{
  scheduledEmails: Awaited<ReturnType<typeof processDueScheduledEmailsForAllUsers>>
  dailyDigests: Awaited<ReturnType<typeof processDailyDigestsForAllUsers>>
  inboxAnalysis: Awaited<ReturnType<typeof processInboxAnalysisQueue>>
  expiredAuthTokensDeleted: number
}> {
  const [scheduledEmails, dailyDigests, inboxAnalysis, expiredAuthTokensDeleted] = await Promise.all([
    processDueScheduledEmailsForAllUsers(),
    processDailyDigestsForAllUsers(),
    processInboxAnalysisQueue({ maxBatches: 1 }),
    deleteExpiredAuthTokens(),
  ])

  return { scheduledEmails, dailyDigests, inboxAnalysis, expiredAuthTokensDeleted }
}
