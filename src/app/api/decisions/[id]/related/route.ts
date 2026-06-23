import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tokenize } from "@/lib/notes"

// GET /api/decisions/[id]/related?limit=5
// Finds related decisions by computing term overlap between the target
// decision's (title + rationale + alternatives) and every other decision's
// same fields. Returns the top N by Jaccard similarity.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 5)

  const target = await db.decision.findUnique({
    where: { id },
    include: { note: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const targetText = `${target.title} ${target.rationale} ${target.alternatives}`.toLowerCase()
  const targetTerms = new Set(tokenize(targetText))
  if (targetTerms.size === 0) return NextResponse.json({ related: [] })

  const others = await db.decision.findMany({
    where: { id: { not: id } },
    include: { note: true },
    take: 500,
  })

  const scored = others
    .map((d) => {
      const dText = `${d.title} ${d.rationale} ${d.alternatives}`.toLowerCase()
      const dTerms = new Set(tokenize(dText))
      if (dTerms.size === 0) return null
      // Jaccard similarity
      let intersection = 0
      for (const t of dTerms) if (targetTerms.has(t)) intersection++
      const union = targetTerms.size + dTerms.size - intersection
      const score = union > 0 ? intersection / union : 0
      return { decision: d, score, sharedTerms: intersection }
    })
    .filter((x): x is { decision: typeof others[0]; score: number; sharedTerms: number } => x !== null && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return NextResponse.json({
    related: scored.map((s) => ({
      id: s.decision.id,
      title: s.decision.title,
      rationale: s.decision.rationale,
      decisionDate: s.decision.decisionDate,
      project: s.decision.project,
      confidence: s.decision.confidence,
      score: Number(s.score.toFixed(3)),
      sharedTerms: s.sharedTerms,
      note: {
        id: s.decision.note.id,
        title: s.decision.note.title,
        sourcePath: s.decision.note.sourcePath,
      },
    })),
  })
}
