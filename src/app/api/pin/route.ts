import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { pinMutationSchema } from "@/server/validation/mutations"

// POST /api/pin
// Toggle the pinned state of a note or decision.
// Body: { type: "note" | "decision", id: string }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const parsed = pinMutationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { type, id } = parsed.data

  if (type === "note") {
    const note = await db.note.findFirst({ where: { id, userId: auth.user.id }, select: { pinned: true } })
    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await db.note.updateMany({
      where: { id, userId: auth.user.id },
      data: { pinned: !note.pinned },
    })
    const updated = await db.note.findFirstOrThrow({ where: { id, userId: auth.user.id } })
    return NextResponse.json({ id, type, pinned: updated.pinned })
  } else {
    const decision = await db.decision.findFirst({ where: { id, userId: auth.user.id }, select: { pinned: true } })
    if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await db.decision.updateMany({
      where: { id, userId: auth.user.id },
      data: { pinned: !decision.pinned },
    })
    const updated = await db.decision.findFirstOrThrow({ where: { id, userId: auth.user.id } })
    return NextResponse.json({ id, type, pinned: updated.pinned })
  }
}
