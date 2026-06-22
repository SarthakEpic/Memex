import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/emails/[id] — single email
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const email = await db.email.findUnique({ where: { id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ email })
}

// DELETE /api/emails/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.email.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
