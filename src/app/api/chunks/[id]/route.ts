import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// GET /api/chunks/[id] — single chunk with its note + decisions
// Used by the citation side panel.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const chunk = await db.chunk.findFirst({
    where: { id, userId: auth.user.id },
    include: {
      note: true,
      decisions: true,
    },
  })
  if (!chunk) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    chunk: {
      id: chunk.id,
      text: chunk.text,
      headingPath: chunk.headingPath,
      chunkIndex: chunk.chunkIndex,
      tokens: chunk.tokens,
      note: {
        id: chunk.note.id,
        title: chunk.note.title,
        sourcePath: chunk.note.sourcePath,
        project: chunk.note.project,
        tags: chunk.note.tags ? chunk.note.tags.split(",") : [],
      },
      decisions: chunk.decisions.map((d) => ({
        id: d.id,
        title: d.title,
        rationale: d.rationale,
        decisionDate: d.decisionDate,
      })),
    },
  })
}
