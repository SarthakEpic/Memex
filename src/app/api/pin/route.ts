import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/pin
// Toggle the pinned state of a note or decision.
// Body: { type: "note" | "decision", id: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { type, id } = body as { type?: string; id?: string }

  if (!type || !id) {
    return NextResponse.json({ error: "type and id are required" }, { status: 400 })
  }
  if (type !== "note" && type !== "decision") {
    return NextResponse.json({ error: "type must be 'note' or 'decision'" }, { status: 400 })
  }

  if (type === "note") {
    const note = await db.note.findUnique({ where: { id }, select: { pinned: true } })
    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const updated = await db.note.update({
      where: { id },
      data: { pinned: !note.pinned },
    })
    return NextResponse.json({ id, type, pinned: updated.pinned })
  } else {
    const decision = await db.decision.findUnique({ where: { id }, select: { pinned: true } })
    if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const updated = await db.decision.update({
      where: { id },
      data: { pinned: !decision.pinned },
    })
    return NextResponse.json({ id, type, pinned: updated.pinned })
  }
}
