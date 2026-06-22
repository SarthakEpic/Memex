import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/chat/sessions/[id] — full session with messages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await db.chatSession.findUnique({
    where: { id },
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
      })),
    },
  })
}

// DELETE /api/chat/sessions/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.chatSession.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
