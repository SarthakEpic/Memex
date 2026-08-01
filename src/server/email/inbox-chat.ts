export type InboxChatQuery = {
  receivedAfter?: Date
  categories?: string[]
  unread?: boolean
  timeDescription: string
}

export type InboxChatEmail = {
  fromName: string
  fromAddress: string
  subject: string
  receivedAt: Date
}

const TIME_WINDOW_PATTERN = /\b(?:in|within|during|for)?\s*(?:the\s+)?(?:last|past)\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)\b/i

export function parseInboxChatQuery(message: string, now = new Date()): InboxChatQuery | null {
  const text = message.toLowerCase()
  const mentionsMailbox = /\b(?:email|emails|mail|inbox|message|messages)\b/.test(text)
  const timeMatch = text.match(TIME_WINDOW_PATTERN)
  const asksMailboxStatus = /\b(?:any|latest|recent|new|unread|important|urgent|newsletter)\b/.test(text)

  if (!mentionsMailbox || (!timeMatch && !asksMailboxStatus)) return null

  const categories = text.includes("urgent")
    ? ["urgent"]
    : text.includes("important")
      ? ["urgent", "important"]
      : text.includes("newsletter")
        ? ["newsletter"]
        : undefined
  const unread = text.includes("unread") || text.includes("new mail") || text.includes("new email")

  if (!timeMatch) {
    return {
      categories,
      unread,
      timeDescription: "in your recent inbox",
    }
  }

  const amount = Number(timeMatch[1])
  if (!Number.isFinite(amount) || amount < 1) return null

  const unit = timeMatch[2].toLowerCase()
  const receivedAfter = new Date(now)
  if (unit.startsWith("min")) receivedAfter.setMinutes(receivedAfter.getMinutes() - amount)
  else if (unit.startsWith("h")) receivedAfter.setHours(receivedAfter.getHours() - amount)
  else receivedAfter.setDate(receivedAfter.getDate() - amount)

  return {
    receivedAfter,
    categories,
    unread,
    timeDescription: `in the last ${amount} ${unit}`,
  }
}

export function formatInboxChatAnswer(query: InboxChatQuery, emails: InboxChatEmail[]): string {
  const categoryLabel = query.categories?.includes("urgent") && query.categories?.includes("important")
    ? "important or urgent "
    : query.categories?.[0] ? `${query.categories[0]} ` : ""
  const unreadLabel = query.unread ? "unread " : ""
  const label = `${unreadLabel}${categoryLabel}email${emails.length === 1 ? "" : "s"}`.trim()

  if (emails.length === 0) {
    return `No ${label} found ${query.timeDescription}.`
  }

  const lines = emails.map((email) => {
    const sender = email.fromName || email.fromAddress
    const received = email.receivedAt.toLocaleString([], {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    })
    return `- **${sender}** — ${email.subject} (${received})`
  })

  return `I found ${emails.length} ${label} ${query.timeDescription}:\n\n${lines.join("\n")}`
}
