import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/timeline?project=X
// Returns chronological events: notes (by createdAt) + decisions (by createdAt)
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project")
  const where = project ? { project } : {}

  const [notes, decisions] = await Promise.all([
    db.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.decision.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { note: true },
    }),
  ])

  type Event =
    | {
        type: "note"
        id: string
        timestamp: string
        title: string
        project: string
        sourcePath: string
        chunkCount: number
        decisionCount: number
      }
    | {
        type: "decision"
        id: string
        timestamp: string
        title: string
        project: string
        rationale: string
        decisionDate: string
        noteId: string
        noteTitle: string
        sourcePath: string
      }

  const events: Event[] = [
    ...notes.map<Event>((n) => ({
      type: "note",
      id: n.id,
      timestamp: n.createdAt.toISOString(),
      title: n.title,
      project: n.project,
      sourcePath: n.sourcePath,
      chunkCount: n.chunkCount,
      decisionCount: 0,
    })),
    ...decisions.map<Event>((d) => ({
      type: "decision",
      id: d.id,
      timestamp: d.createdAt.toISOString(),
      title: d.title,
      project: d.project,
      rationale: d.rationale,
      decisionDate: d.decisionDate,
      noteId: d.noteId,
      noteTitle: d.note.title,
      sourcePath: d.note.sourcePath,
    })),
  ]

  events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))

  return NextResponse.json({ events })
}
