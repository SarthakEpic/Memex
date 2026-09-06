export type ChatEmailRecord = {
  id: string
  fromName: string
  fromAddress: string
  toAddress: string
  subject: string
  body: string
  receivedAt: Date
}

export type EmailDisplayIntent = {
  query?: string
  useActiveEmail: boolean
}

const DISPLAY_PREFIX = /^(?:open|show|read|display|view)\s+(?:me\s+)?(?:the\s+)?/i

export function parseEmailDisplayIntent(message: string): EmailDisplayIntent | null {
  const text = message.trim()
  const lower = text.toLowerCase()
  const usesActiveReference = /\b(?:it|this|that|here|the email|the mail)\b/.test(lower)

  if (/^(?:show|open|read|display|view)\s+(?:me\s+)?(?:it|this|that|here|the email|the mail)\b/i.test(text)) {
    return { useActiveEmail: true }
  }

  if (/^(?:what did|what does)\s+(?:he|she|they|it)\s+(?:write|say)\b/i.test(text) || /^(?:read|summari[sz]e)\s+it\b/i.test(text)) {
    return { useActiveEmail: true }
  }

  if (!/\b(?:email|mail|message)\b/i.test(text) || !DISPLAY_PREFIX.test(text)) return null

  const query = text
    .replace(DISPLAY_PREFIX, "")
    .replace(/\b(?:email|mail|message)\b/gi, "")
    .replace(/\b(?:from|by)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  return query ? { query, useActiveEmail: false } : usesActiveReference ? { useActiveEmail: true } : null
}

export function rankInboxEmailMatch(query: string, email: Pick<ChatEmailRecord, "fromName" | "fromAddress" | "subject">): number {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 0

  const sender = normalize(`${email.fromName} ${email.fromAddress}`)
  const subject = normalize(email.subject)
  if (sender.includes(normalizedQuery)) return 100
  if (subject.includes(normalizedQuery)) return 80

  const terms = normalizedQuery.split(" ").filter((term) => term.length > 1)
  return terms.reduce((score, term) => score + (sender.includes(term) ? 10 : 0) + (subject.includes(term) ? 6 : 0), 0)
}

export function formatInboxEmailForChat(email: ChatEmailRecord): string {
  const sender = email.fromName || email.fromAddress
  const received = email.receivedAt.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  const body = email.body.trim() || "(This email has no readable text body.)"

  return [
    `## ${email.subject || "(no subject)"}`,
    `**From:** ${sender} <${email.fromAddress}>`,
    `**To:** ${email.toAddress}`,
    `**Received:** ${received}`,
    "",
    "---",
    "",
    body,
    "",
    "---",
    "Reply in this chat with what you want to say, and I will prepare a draft for your review.",
  ].join("\n")
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

// Keep full email bodies visible to the user, but never replay them through
// later model requests. The local chat session already retains the selected ID.
export function compactChatHistoryContent(content: string): string {
  if (!content.startsWith("## ") || !content.includes("**From:**") || !content.includes("---")) {
    return content
  }

  const lines = content.split(/\r?\n/)
  const header = lines
    .filter((line) => line.startsWith("## ") || line.startsWith("**From:**") || line.startsWith("**To:**") || line.startsWith("**Received:**"))
    .slice(0, 4)

  return header.join("\n") + "\n\n[Opened email body omitted from later AI context. Use the selected email only when drafting a reply.]"
}