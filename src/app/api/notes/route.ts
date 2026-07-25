import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ingestNote } from "@/server/services/ingestion"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { createNoteSchema, validationError } from "@/server/validation/api"

// GET /api/notes — list all notes (with chunk count, decision count)
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const project = req.nextUrl.searchParams.get("project")
  const where = project ? { userId: auth.user.id, project } : { userId: auth.user.id }
  const notes = await db.note.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { chunks: true, decisions: true } },
    },
  })
  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      sourcePath: n.sourcePath,
      project: n.project,
      tags: n.tags ? n.tags.split(",") : [],
      chunkCount: n._count.chunks,
      decisionCount: n._count.decisions,
      pinned: n.pinned,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
  })
}

// POST /api/notes — create/ingest a note (chunks it, extracts decisions)
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const parsed = createNoteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const result = await ingestNote({
    userId: auth.user.id,
    title: parsed.data.title,
    content: parsed.data.content,
    project: parsed.data.project || "general",
    tags: parsed.data.tags,
    extractDecisions: parsed.data.extractDecisions,
  })

  return NextResponse.json({
    id: result.id,
    title: result.title,
    sourcePath: result.sourcePath,
    chunkCount: result.chunkCount,
    decisionsExtracted: result.decisionsExtracted,
    skipped: result.skipped,
    message: result.skipped
      ? "Note unchanged (content hash match)."
      : `Ingested ${result.chunkCount} chunks${
          result.decisionsExtracted > 0 ? `, extracted ${result.decisionsExtracted} decisions` : ""
        }.`,
  })
}
