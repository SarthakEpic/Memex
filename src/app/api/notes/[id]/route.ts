import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateCorpusCache } from "@/lib/retrieval"

// GET /api/notes/[id] — full note with chunks + decisions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const note = await db.note.findUnique({
    where: { id },
    include: {
      chunks: { orderBy: { chunkIndex: "asc" } },
      decisions: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    note: {
      ...note,
      tags: note.tags ? note.tags.split(",") : [],
    },
  })
}

// DELETE /api/notes/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.note.delete({ where: { id } })
  invalidateCorpusCache()
  return NextResponse.json({ ok: true })
}
