import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// GET /api/emails/[id] — single email
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const email = await db.email.findFirst({ where: { id, userId: auth.user.id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ email })
}

// DELETE /api/emails/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  await db.email.deleteMany({ where: { id, userId: auth.user.id } })
  return NextResponse.json({ ok: true })
}
