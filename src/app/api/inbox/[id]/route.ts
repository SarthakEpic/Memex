import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/inbox/[id] — single inbox email
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const email = await db.inboxEmail.findUnique({ where: { id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Mark as read when viewed
  if (!email.isRead) {
    await db.inboxEmail.update({
      where: { id },
      data: { isRead: true },
    })
  }

  return NextResponse.json({
    email: {
      ...email,
      keyPoints: safeParse(email.keyPoints, []),
    },
  })
}

// PATCH /api/inbox/[id] — update status (star, archive, mark read/unread)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { isRead, isStarred, isArchived, category } = body as {
    isRead?: boolean
    isStarred?: boolean
    isArchived?: boolean
    category?: string
  }

  const data: any = {}
  if (isRead !== undefined) data.isRead = isRead
  if (isStarred !== undefined) data.isStarred = isStarred
  if (isArchived !== undefined) data.isArchived = isArchived
  if (category !== undefined) data.category = category

  const email = await db.inboxEmail.update({ where: { id }, data })
  return NextResponse.json({ email })
}

// DELETE /api/inbox/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.inboxEmail.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
