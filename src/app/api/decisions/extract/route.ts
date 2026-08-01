import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { extractDecisions } from "@/lib/llm"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { decisionExtractSchema } from "@/server/validation/mutations"
import { rateLimit } from "@/server/security/rate-limit"

// POST /api/decisions/extract
// Body: { noteId: string } — re-run decision extraction on all chunks of a note
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, {
    name: "decisions:extract",
    limit: 10,
    windowMs: 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = decisionExtractSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { noteId } = parsed.data

  const note = await db.note.findFirst({
    where: { id: noteId, userId: auth.user.id },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } },
  })
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 })

  // Clear old decisions for this note
  await db.decision.deleteMany({ where: { noteId, userId: auth.user.id } })

  let extracted = 0
  for (const c of note.chunks) {
    try {
      const ds = await extractDecisions(c.text, c.headingPath)
      for (const d of ds) {
        await db.decision.create({
          data: {
            userId: auth.user.id,
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
