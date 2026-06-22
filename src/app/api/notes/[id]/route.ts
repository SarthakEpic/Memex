import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { reingestNote } from "@/lib/ingest"

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

// PATCH /api/notes/[id] — edit an existing note (re-chunks + re-extracts decisions)
// Body: { title?, content?, project?, tags?, extractDecisions? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { title, content, project, tags, extractDecisions = true } = body as {
    title?: string
    content?: string
    project?: string
    tags?: string[]
    extractDecisions?: boolean
  }

  const existing = await db.note.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Merge with existing values
  const newTitle = title?.trim() || existing.title
  const newContent = content ?? existing.content
  const newProject = project?.trim() || existing.project
  const newTags = tags ?? (existing.tags ? existing.tags.split(",") : [])

  if (!newContent || typeof newContent !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  const result = await reingestNote(id, {
    title: newTitle,
    content: newContent,
    project: newProject,
    tags: newTags,
    sourcePath: existing.sourcePath,
    extractDecisions,
  })

  return NextResponse.json({
    id: result.noteId,
    title: result.title,
    sourcePath: result.sourcePath,
    chunkCount: result.chunkCount,
    decisionsExtracted: result.decisionsExtracted,
    message: `Updated: ${result.chunkCount} chunks${
      result.decisionsExtracted > 0 ? `, ${result.decisionsExtracted} decisions` : ""
    }.`,
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

