import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { chatSessionUpdateSchema } from "@/server/validation/mutations"

// GET /api/chat/sessions/[id] — full session with messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const session = await db.chatSession.findFirst({
    where: { id, userId: auth.user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    session: {
      ...session,
      messages: session.messages.map((m) => ({
        ...m,
        citations: safeParse(m.citations, []),
        emailDraft: safeParse(m.emailDraft, null),
      })),
    },
  })
}

// DELETE /api/chat/sessions/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  await db.chatSession.deleteMany({ where: { id, userId: auth.user.id } })
  return NextResponse.json({ ok: true })
}

// PATCH /api/chat/sessions/[id] — rename a session
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = chatSessionUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { title } = parsed.data
  const existing = await db.chatSession.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await db.chatSession.updateMany({
    where: { id, userId: auth.user.id },
    data: { title },
  })
  const session = await db.chatSession.findFirstOrThrow({ where: { id, userId: auth.user.id } })
  return NextResponse.json({ session: { id: session.id, title: session.title } })
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
