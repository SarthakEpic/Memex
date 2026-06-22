import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/chunks/[id] — single chunk with its note + decisions
// Used by the citation side panel.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const chunk = await db.chunk.findUnique({
    where: { id },
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
