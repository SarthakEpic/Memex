import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { reingestNote } from "@/lib/ingest"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { noteUpdateSchema } from "@/server/validation/mutations"

// GET /api/notes/[id] — full note with chunks + decisions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const note = await db.note.findFirst({
    where: { id, userId: auth.user.id },
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
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = noteUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { title, content, project, tags, extractDecisions = true } = parsed.data

  const existing = await db.note.findFirst({ where: { id, userId: auth.user.id } })
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
    userId: auth.user.id,
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  await db.note.deleteMany({ where: { id, userId: auth.user.id } })
  invalidateCorpusCache(auth.user.id)
  return NextResponse.json({ ok: true })
}
