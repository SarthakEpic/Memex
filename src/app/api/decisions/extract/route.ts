import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { extractDecisions } from "@/lib/llm"

// POST /api/decisions/extract
// Body: { noteId: string } — re-run decision extraction on all chunks of a note
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { noteId } = body as { noteId?: string }
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 })

  const note = await db.note.findUnique({
    where: { id: noteId },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } },
  })
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 })

  // Clear old decisions for this note
  await db.decision.deleteMany({ where: { noteId } })

  let extracted = 0
  for (const c of note.chunks) {
    try {
      const ds = await extractDecisions(c.text, c.headingPath)
      for (const d of ds) {
        await db.decision.create({
          data: {
            noteId: note.id,
            chunkId: c.id,
            title: d.title,
            decisionDate: d.decisionDate || "",
            rationale: d.rationale,
            alternatives: (d.alternatives || []).join("|"),
            outcome: d.outcome || "",
            participants: (d.participants || []).join("|"),
            project: note.project,
            confidence: d.confidence ?? 0.8,
          },
        })
        extracted++
      }
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ noteId, extracted })
}
