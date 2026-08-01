import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { inboxUpdateSchema } from "@/server/validation/mutations"

// GET /api/inbox/[id] — single inbox email
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const email = await db.inboxEmail.findFirst({ where: { id, userId: auth.user.id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Mark as read when viewed
  if (!email.isRead) {
    await db.inboxEmail.updateMany({
      where: { id, userId: auth.user.id },
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
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = inboxUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const data = parsed.data

  await db.inboxEmail.updateMany({ where: { id, userId: auth.user.id }, data })
  const email = await db.inboxEmail.findFirstOrThrow({ where: { id, userId: auth.user.id } })
  return NextResponse.json({ email })
}

// DELETE /api/inbox/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  await db.inboxEmail.deleteMany({ where: { id, userId: auth.user.id } })
  return NextResponse.json({ ok: true })
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
