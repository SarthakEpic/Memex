import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { retrieve } from "@/lib/retrieval"

// GET /api/decisions?project=X&q=search
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project")
  const q = req.nextUrl.searchParams.get("q")

  const where: { project?: string; OR?: any[] } = {}
  if (project) where.project = project
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { rationale: { contains: q } },
      { alternatives: { contains: q } },
      { outcome: { contains: q } },
    ]
  }

  const decisions = await db.decision.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { note: true, chunk: true },
    take: 200,
  })

  return NextResponse.json({
    decisions: decisions.map((d) => ({
      id: d.id,
      title: d.title,
      decisionDate: d.decisionDate,
      rationale: d.rationale,
      alternatives: d.alternatives ? d.alternatives.split("|") : [],
      outcome: d.outcome,
      participants: d.participants ? d.participants.split("|") : [],
      project: d.project,
      confidence: d.confidence,
      pinned: d.pinned,
      createdAt: d.createdAt,
      note: {
        id: d.note.id,
        title: d.note.title,
        sourcePath: d.note.sourcePath,
      },
      chunk: {
        id: d.chunk.id,
        chunkIndex: d.chunk.chunkIndex,
        headingPath: d.chunk.headingPath,
        snippet: d.chunk.text.slice(0, 200) + (d.chunk.text.length > 200 ? "…" : ""),
      },
    })),
  })
}
