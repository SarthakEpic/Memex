import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/decisions/[id] — single decision with full source chunk
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const decision = await db.decision.findUnique({
    where: { id },
    include: { note: true, chunk: true },
  })
  if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    decision: {
      id: decision.id,
      title: decision.title,
      decisionDate: decision.decisionDate,
      rationale: decision.rationale,
      alternatives: decision.alternatives ? decision.alternatives.split("|") : [],
      outcome: decision.outcome,
      participants: decision.participants ? decision.participants.split("|") : [],
      project: decision.project,
      confidence: decision.confidence,
      createdAt: decision.createdAt,
      note: {
        id: decision.note.id,
        title: decision.note.title,
        sourcePath: decision.note.sourcePath,
        project: decision.note.project,
      },
      chunk: {
        id: decision.chunk.id,
        text: decision.chunk.text,
        headingPath: decision.chunk.headingPath,
        chunkIndex: decision.chunk.chunkIndex,
      },
    },
  })
}
