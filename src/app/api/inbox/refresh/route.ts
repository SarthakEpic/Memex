import { after, NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { enqueueInboxAnalysis, processInboxAnalysisQueue } from "@/server/email/analysis-pipeline"
import { decryptSecret } from "@/server/security/encryption"
import {
  getInboxSyncCutoff,
  type InboxSyncRange,
  type InboxSyncResult,
  syncOAuthInbox,
} from "@/server/email/oauth-inbox"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import { refreshInboxSchema, validationError } from "@/server/validation/api"
import type { EmailAccount } from "@prisma/client"

const PERIOD_SYNC_BATCH_SIZE = 100

// POST /api/inbox/refresh
// Imports by one exclusive scope: a time period or a newest-message count.
// AI analysis is deliberately deferred so provider sync returns quickly.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, {
    name: "inbox:refresh",
    limit: 20,
    windowMs: 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = refreshInboxSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const requestScope = parsed.data.scope
  const maxCount = requestScope === "period" ? PERIOD_SYNC_BATCH_SIZE : parsed.data.count
  const range: InboxSyncRange = requestScope === "period" ? parsed.data.range : "all"

  const accounts = await db.emailAccount.findMany({
    where: { userId: auth.user.id, connected: true },
    orderBy: { createdAt: "asc" },
  })
  const liveAccounts = accounts.filter(
    (account) => account.syncMode === "oauth" || account.syncMode === "real"
  )

  if (liveAccounts.length === 0) {
    return NextResponse.json(
      { error: "No live email account is connected. Reconnect Google, Microsoft, or an advanced IMAP account." },
      { status: 400 }
    )
  }

  const results: Array<{
    accountId: string
    emailAddress: string
    syncMode: string
    added: number
    hasMore: boolean
    importedIds: string[]
    ok: boolean
    error?: string
  }> = []

  for (const account of liveAccounts) {
    try {
      const result = account.syncMode === "oauth"
        ? await syncOAuthInbox(account, maxCount, range)
        : await syncRealImap(account, maxCount, range)
      await db.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date() },
      })
      results.push({
        accountId: account.id,
        emailAddress: account.emailAddress,
        syncMode: account.syncMode,
        added: result.added,
        hasMore: result.hasMore,
        importedIds: result.importedIds,
        ok: true,
      })
    } catch (error) {
      console.error("Inbox sync failed", {
        accountId: account.id,
        syncMode: account.syncMode,
        error: error instanceof Error ? error.message : String(error),
      })
      results.push({
        accountId: account.id,
        emailAddress: account.emailAddress,
        syncMode: account.syncMode,
        added: 0,
        hasMore: false,
        importedIds: [],
        ok: false,
        error: error instanceof Error ? error.message : "Inbox sync failed. Reconnect the account and try again.",
      })
    }
  }

  const added = results.reduce((total, result) => total + result.added, 0)
  const importedIds = results.flatMap((result) => result.importedIds)
  const failures = results.filter((result) => !result.ok)
  const modes = new Set(results.map((result) => result.syncMode))
  const syncMode = modes.size > 1 ? "mixed" : results[0].syncMode
  const hasMore = results.some((result) => result.hasMore)

  if (failures.length === results.length) {
    return NextResponse.json(
      {
        error: failures[0].error || "Inbox sync failed.",
        added: 0,
        hasMore: false,
        scope: requestScope,
        syncMode,
        results: publicResults(results),
      },
      { status: 502 }
    )
  }

  const analysis = importedIds.length > 0
    ? await enqueueInboxAnalysis(auth.user.id, importedIds)
    : { queued: 0, classifiedLocally: 0 }

  if (analysis.queued > 0) {
    after(async () => {
      try {
        await processInboxAnalysisQueue({ userId: auth.user.id, maxBatches: 1 })
      } catch (error) {
        console.error("Deferred inbox analysis failed", {
          userId: auth.user.id,
          count: analysis.queued,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  const baseMessage = added > 0
    ? `Imported ${added} new email${added === 1 ? "" : "s"}. ${analysis.classifiedLocally > 0 ? `${analysis.classifiedLocally} were organized locally. ` : ""}${analysis.queued > 0 ? "The remaining messages are queued for careful AI review." : ""}`.trim()
    : requestScope === "period"
      ? "Inbox is up to date for the selected period."
      : `No new messages were found among the latest ${parsed.data.count}.`

  return NextResponse.json({
    added,
    analysisQueued: analysis.queued,
    classifiedLocally: analysis.classifiedLocally,
    hasMore,
    scope: requestScope,
    range: requestScope === "period" ? range : undefined,
    count: requestScope === "count" ? parsed.data.count : undefined,
    syncMode,
    results: publicResults(results),
    warning:
      failures.length > 0
        ? `${failures.length} account${failures.length === 1 ? "" : "s"} could not be synced.`
        : requestScope === "period" && hasMore
          ? `This period contains more than ${PERIOD_SYNC_BATCH_SIZE} new emails. Sync again to continue this period.`
          : undefined,
    message: baseMessage,
  })
}

function publicResults(
  results: Array<{
    accountId: string
    emailAddress: string
    syncMode: string
    added: number
    hasMore: boolean
    ok: boolean
    error?: string
  }>
) {
  return results.map(({ accountId, emailAddress, syncMode, added, hasMore, ok, error }) => ({
    accountId,
    emailAddress,
    syncMode,
    added,
    hasMore,
    ok,
    error,
  }))
}

async function syncRealImap(
  account: EmailAccount,
  maxCount: number,
  range: InboxSyncRange
): Promise<InboxSyncResult> {
  const { ImapFlow } = await import("imapflow")
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.imapUser || account.emailAddress,
      pass: decryptSecret(account.imapPassword),
    },
    logger: false,
  })

  await client.connect()
  const importedIds: string[] = []
  let hasMore = false

  try {
    const lock = await client.getMailboxLock("INBOX")
    try {
      const cutoff = getInboxSyncCutoff(range)
      const searchResult = await client.search(cutoff ? { since: cutoff } : {})
      const matchingIds = (Array.isArray(searchResult) ? searchResult : []).reverse()

      for (let index = 0; index < matchingIds.length; index++) {
        if (importedIds.length >= maxCount) {
          hasMore = true
          break
        }
        const messageId = matchingIds[index]
        const providerMessageId = `imap:${messageId}`
        const existing = await db.inboxEmail.findFirst({
          where: { accountId: account.id, providerMessageId },
          select: { id: true },
        })
        if (existing) continue

        const message = await client.fetchOne(messageId, {
          envelope: true,
          source: true,
          bodyStructure: true,
        })
        if (!message || !message.envelope) continue

        const from = message.envelope.from?.[0]
        const fromAddress = from ? `${from.address}` : "unknown@unknown.com"
        const fromName = from ? `${from.name || from.address}` : "Unknown"
        const body = extractPlainText(message.source?.toString("utf-8") || "")
        if (body.trim().length < 10) continue

        const email = await db.inboxEmail.create({
          data: {
            userId: account.userId,
            accountId: account.id,
            fromAddress,
            fromName,
            toAddress: account.emailAddress,
            subject: message.envelope.subject || "(no subject)",
            body: body.slice(0, 200_000),
            category: "normal",
            action: "review",
            summary: "",
            keyPoints: "[]",
            suggestedReply: "",
            analyzed: false,
            threadId: (message.envelope.subject || "")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .slice(0, 40),
            providerMessageId,
            receivedAt: message.envelope.date ? new Date(message.envelope.date) : new Date(),
          },
          select: { id: true },
        })
        importedIds.push(email.id)
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }

  return { added: importedIds.length, hasMore, importedIds }
}

function extractPlainText(raw: string): string {
  const textPartMatch = raw.match(/Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i)
  if (textPartMatch) {
    return textPartMatch[1]
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .trim()
  }

  const htmlPartMatch = raw.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i)
  if (htmlPartMatch) {
    return htmlPartMatch[1]
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
  }

  return raw.slice(0, 500).replace(/<[^>]*>/g, " ").trim()
}