import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/inbox?category=X&unread=true
// List inbox emails with optional filters
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category")
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true"

  const where: { category?: string; isRead?: boolean; isArchived?: boolean } = {
    isArchived: false,
  }
  if (category && category !== "all") where.category = category
  if (unreadOnly) where.isRead = false

  const emails = await db.inboxEmail.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 100,
  })

  return NextResponse.json({
    emails: emails.map((e) => ({
      ...e,
      keyPoints: safeParse(e.keyPoints, []),
    })),
  })
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
