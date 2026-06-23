import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/inbox?category=X&unread=true&q=search&threaded=true
// List inbox emails with optional filters.
// If threaded=true, groups emails by threadId and returns thread structure.
// If q=search, filters by sender/subject/body content.
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category")
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true"
  const search = req.nextUrl.searchParams.get("q")
  const threaded = req.nextUrl.searchParams.get("threaded") === "true"

  const where: any = { isArchived: false }
  if (category && category !== "all") where.category = category
  if (unreadOnly) where.isRead = false
  if (search) {
    where.OR = [
      { fromAddress: { contains: search } },
      { fromName: { contains: search } },
      { subject: { contains: search } },
      { body: { contains: search } },
    ]
  }

  const emails = await db.inboxEmail.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 100,
  })

  const mapped = emails.map((e) => ({
    ...e,
    keyPoints: safeParse(e.keyPoints, []),
  }))

  if (threaded) {
    // Group by threadId
    const threads = new Map<string, typeof mapped>()
    for (const email of mapped) {
      const tid = email.threadId || email.subject.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)
      if (!threads.has(tid)) threads.set(tid, [])
      threads.get(tid)!.push(email)
    }
    // Sort threads by most recent email
    const threadArray = Array.from(threads.entries())
      .map(([threadId, emails]) => ({
        threadId,
        emails: emails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
        count: emails.length,
        latestSubject: emails[0]?.subject || "",
        latestFrom: emails[0]?.fromName || emails[0]?.fromAddress || "",
        latestDate: emails[0]?.receivedAt || "",
        hasUnread: emails.some((e) => !e.isRead),
        categories: Array.from(new Set(emails.map((e) => e.category))),
      }))
      .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime())

    return NextResponse.json({ threads: threadArray, emails: mapped })
  }

  return NextResponse.json({ emails: mapped })
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
