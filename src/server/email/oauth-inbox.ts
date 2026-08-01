import { db } from "@/lib/db"
import { EmailOAuthError, isEmailOAuthProvider, oauthProviderFetch } from "@/server/email/oauth"
import type { EmailAccount } from "@prisma/client"

export const INBOX_SYNC_RANGES = ["day", "week", "month", "year", "all"] as const
export type InboxSyncRange = (typeof INBOX_SYNC_RANGES)[number]

export type InboxSyncResult = {
  added: number
  hasMore: boolean
  importedIds: string[]
}

type GmailMessage = {
  id?: string
  threadId?: string
  internalDate?: string
  payload?: {
    headers?: Array<{ name?: string; value?: string }>
    mimeType?: string
    body?: { data?: string }
    parts?: GmailMessage["payload"][]
  }
}

type GraphMessage = {
  id?: string
  conversationId?: string
  subject?: string
  from?: { emailAddress?: { address?: string; name?: string } }
  receivedDateTime?: string
  bodyPreview?: string
  body?: { content?: string }
}

const PROVIDER_PAGE_SIZE = 100
const MAX_PAGES_PER_SYNC = 10
const GMAIL_FETCH_CONCURRENCY = 8
const DATABASE_WRITE_CONCURRENCY = 8

export async function syncOAuthInbox(
  account: EmailAccount,
  maxCount: number,
  range: InboxSyncRange
): Promise<InboxSyncResult> {
  if (!isEmailOAuthProvider(account.provider)) {
    throw new EmailOAuthError("This account does not have a supported OAuth provider.", true)
  }
  return account.provider === "google"
    ? syncGoogleInbox(account, maxCount, range)
    : syncMicrosoftInbox(account, maxCount, range)
}

export function getInboxSyncCutoff(range: InboxSyncRange, now = new Date()): Date | null {
  if (range === "all") return null
  const cutoff = new Date(now)
  if (range === "day") cutoff.setDate(cutoff.getDate() - 1)
  if (range === "week") cutoff.setDate(cutoff.getDate() - 7)
  if (range === "month") cutoff.setMonth(cutoff.getMonth() - 1)
  if (range === "year") cutoff.setFullYear(cutoff.getFullYear() - 1)
  return cutoff
}

async function syncGoogleInbox(
  account: EmailAccount,
  maxCount: number,
  range: InboxSyncRange
): Promise<InboxSyncResult> {
  const cutoff = getInboxSyncCutoff(range)
  const importedIds: string[] = []
  let nextPageToken: string | undefined
  let hasMore = false

  for (let page = 0; page < MAX_PAGES_PER_SYNC && importedIds.length < maxCount; page++) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    url.searchParams.set("labelIds", "INBOX")
    url.searchParams.set("maxResults", String(PROVIDER_PAGE_SIZE))
    if (cutoff) url.searchParams.set("q", `after:${formatGmailDate(cutoff)}`)
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken)

    const list = await oauthProviderFetch(account, url)
    if (!list.ok) throw await providerFailure("Google", list)
    const payload = (await list.json()) as {
      messages?: Array<{ id?: string }>
      nextPageToken?: string
    }
    const references = (payload.messages ?? []).filter(
      (reference): reference is { id: string } => Boolean(reference.id)
    )
    const existingIds = await findExistingProviderIds(account.id, references.map((reference) => reference.id))
    const availableSlots = maxCount - importedIds.length
    const newReferences = references
      .filter((reference) => !existingIds.has(reference.id))
      .slice(0, availableSlots)

    const messages = await mapWithConcurrency(
      newReferences,
      GMAIL_FETCH_CONCURRENCY,
      async (reference) => fetchGoogleMessage(account, reference.id)
    )
    const createdIds = await mapWithConcurrency(
      messages,
      DATABASE_WRITE_CONCURRENCY,
      (message) => persistInboxEmail({ account, ...message })
    )
    importedIds.push(...createdIds.filter((id): id is string => Boolean(id)))

    nextPageToken = payload.nextPageToken
    hasMore = Boolean(nextPageToken) || newReferences.length < references.length - existingIds.size
    if (!nextPageToken) break
  }

  return { added: importedIds.length, hasMore, importedIds }
}

async function fetchGoogleMessage(account: EmailAccount, messageId: string) {
  const response = await oauthProviderFetch(
    account,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`
  )
  if (!response.ok) throw await providerFailure("Google", response)
  const message = (await response.json()) as GmailMessage
  const headers = new Map(
    (message.payload?.headers ?? []).map((header) => [header.name?.toLowerCase() ?? "", header.value ?? ""])
  )
  const sender = parseAddress(headers.get("from") ?? "")
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate))
    : new Date(headers.get("date") ?? Date.now())

  return {
    fromAddress: sender.address,
    fromName: sender.name,
    subject: headers.get("subject")?.trim() || "(no subject)",
    body: extractGmailBody(message.payload) || "(No message body was returned by Gmail.)",
    threadId: message.threadId || messageId,
    providerMessageId: message.id || messageId,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
  }
}

async function syncMicrosoftInbox(
  account: EmailAccount,
  maxCount: number,
  range: InboxSyncRange
): Promise<InboxSyncResult> {
  const cutoff = getInboxSyncCutoff(range)
  const importedIds: string[] = []
  let nextUrl: URL | null = createMicrosoftInboxUrl(cutoff)
  let hasMore = false

  for (let page = 0; page < MAX_PAGES_PER_SYNC && importedIds.length < maxCount && nextUrl; page++) {
    const response = await oauthProviderFetch(account, nextUrl)
    if (!response.ok) throw await providerFailure("Microsoft", response)
    const payload = (await response.json()) as {
      value?: GraphMessage[]
      "@odata.nextLink"?: string
    }
    const messages = (payload.value ?? []).filter(
      (message): message is GraphMessage & { id: string } => Boolean(message.id)
    )
    const existingIds = await findExistingProviderIds(account.id, messages.map((message) => message.id))
    const availableSlots = maxCount - importedIds.length
    const newMessages = messages
      .filter((message) => !existingIds.has(message.id))
      .slice(0, availableSlots)
    const createdIds = await mapWithConcurrency(
      newMessages,
      DATABASE_WRITE_CONCURRENCY,
      (message) => persistInboxEmail({
        account,
        fromAddress: message.from?.emailAddress?.address?.trim().toLowerCase() || "unknown@unknown.com",
        fromName: message.from?.emailAddress?.name?.trim() || message.from?.emailAddress?.address || "Unknown",
        subject: message.subject?.trim() || "(no subject)",
        body: htmlToText(message.body?.content || message.bodyPreview || "(No message body was returned by Microsoft.)"),
        threadId: message.conversationId || message.id,
        providerMessageId: message.id,
        receivedAt: validDate(message.receivedDateTime),
      })
    )
    importedIds.push(...createdIds.filter((id): id is string => Boolean(id)))

    nextUrl = payload["@odata.nextLink"] ? new URL(payload["@odata.nextLink"]) : null
    hasMore = Boolean(nextUrl) || newMessages.length < messages.length - existingIds.size
  }

  return { added: importedIds.length, hasMore, importedIds }
}

function createMicrosoftInboxUrl(cutoff: Date | null): URL {
  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages")
  url.searchParams.set("$top", String(PROVIDER_PAGE_SIZE))
  url.searchParams.set("$orderby", "receivedDateTime desc")
  url.searchParams.set("$select", "id,conversationId,subject,from,receivedDateTime,bodyPreview,body")
  if (cutoff) url.searchParams.set("$filter", `receivedDateTime ge ${cutoff.toISOString()}`)
  return url
}

async function findExistingProviderIds(accountId: string, providerMessageIds: string[]): Promise<Set<string>> {
  if (providerMessageIds.length === 0) return new Set()
  const existing = await db.inboxEmail.findMany({
    where: { accountId, providerMessageId: { in: providerMessageIds } },
    select: { providerMessageId: true },
  })
  return new Set(existing.map((email) => email.providerMessageId))
}

async function persistInboxEmail(input: {
  account: EmailAccount
  fromAddress: string
  fromName: string
  subject: string
  body: string
  threadId: string
  providerMessageId: string
  receivedAt: Date
}): Promise<string | null> {
  const existing = await db.inboxEmail.findFirst({
    where: input.providerMessageId
      ? { accountId: input.account.id, providerMessageId: input.providerMessageId }
      : {
          userId: input.account.userId,
          fromAddress: input.fromAddress,
          subject: input.subject,
          receivedAt: input.receivedAt,
        },
    select: { id: true },
  })
  if (existing) return null

  const email = await db.inboxEmail.create({
    data: {
      userId: input.account.userId,
      accountId: input.account.id,
      fromAddress: input.fromAddress,
      fromName: input.fromName,
      toAddress: input.account.emailAddress,
      subject: input.subject,
      body: input.body.slice(0, 200_000),
      category: "normal",
      action: "review",
      summary: "",
      keyPoints: "[]",
      suggestedReply: "",
      analyzed: false,
      threadId: input.threadId.slice(0, 160),
      providerMessageId: input.providerMessageId.slice(0, 512),
      receivedAt: input.receivedAt,
    },
    select: { id: true },
  })
  return email.id
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await worker(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  )
  return results
}

function extractGmailBody(payload: GmailMessage["payload"] | undefined): string {
  if (!payload) return ""
  if (payload.mimeType?.startsWith("text/plain") && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  for (const part of payload.parts ?? []) {
    const text = extractGmailBody(part)
    if (text) return text
  }
  if (payload.mimeType?.startsWith("text/html") && payload.body?.data) {
    return htmlToText(decodeBase64Url(payload.body.data))
  }
  return ""
}

function decodeBase64Url(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8").trim()
  } catch {
    return ""
  }
}

function formatGmailDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("/")
}

function parseAddress(value: string): { address: string; name: string } {
  const matched = value.match(/^(.*?)\s*<([^>]+)>$/)
  const address = (matched?.[2] ?? value).trim().toLowerCase()
  return {
    address: address.includes("@") ? address : "unknown@unknown.com",
    name: (matched?.[1] ?? address).replace(/^"|"$/g, "").trim() || address,
  }
}

function validDate(value: string | undefined): Date {
  const date = new Date(value ?? Date.now())
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function htmlToText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
}

async function providerFailure(provider: string, response: Response): Promise<EmailOAuthError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { errors?: Array<{ reason?: string }> }
  }
  if (provider === "Google" && body.error?.errors?.some((error) => error.reason === "accessNotConfigured")) {
    return new EmailOAuthError("Gmail API is not enabled for this Google Cloud project. Enable the Gmail API, wait a few minutes, then sync again.")
  }
  if (response.status === 401 || response.status === 403) {
    return new EmailOAuthError(`${provider} access expired or was revoked. Reconnect this account.`, true)
  }
  return new EmailOAuthError(`${provider} inbox sync failed. Try again shortly.`)
}