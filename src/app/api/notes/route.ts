import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  chunkMarkdown,
  contentHash,
  termFreq,
  estimateTokens,
} from "@/lib/notes"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { extractDecisions } from "@/lib/llm"

// GET /api/notes — list all notes (with chunk count, decision count)
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project")
  const where = project ? { project } : {}
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
  const body = await req.json().catch(() => ({}))
  const { title, content, project, tags, extractDecisions: doExtract = true } = body as {
    title?: string
    content?: string
    project?: string
    tags?: string[]
    extractDecisions?: boolean
  }

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  const noteTitle = title?.trim() || extractTitle(content)
  const sourcePath = `/notes/${slugify(noteTitle)}.md`
  const hash = await contentHash(content)

  // Upsert by sourcePath — if content hash matches, skip re-chunking
  const existing = await db.note.findUnique({ where: { sourcePath } })
  if (existing && existing.contentHash === hash) {
    return NextResponse.json({
      id: existing.id,
      title: existing.title,
      sourcePath: existing.sourcePath,
      chunkCount: existing.chunkCount,
      skipped: true,
      message: "Note unchanged (content hash match).",
    })
  }

  if (existing) {
    // Replace — delete old chunks + decisions, then re-ingest
    await db.decision.deleteMany({ where: { noteId: existing.id } })
    await db.chunk.deleteMany({ where: { noteId: existing.id } })
  }

  const note = await db.note.upsert({
    where: { sourcePath },
    create: {
      title: noteTitle,
      content,
      sourcePath,
      project: project || "general",
      tags: (tags || []).join(","),
      contentHash: hash,
    },
    update: {
      title: noteTitle,
      content,
      project: project || "general",
      tags: (tags || []).join(","),
      contentHash: hash,
      updatedAt: new Date(),
    },
  })

  const chunks = chunkMarkdown(content, noteTitle)
  let decisionsExtracted = 0

  for (const c of chunks) {
    const tf = termFreq(c.text)
    const chunk = await db.chunk.create({
      data: {
        noteId: note.id,
        chunkIndex: c.chunkIndex,
        text: c.text,
        headingPath: c.headingPath,
        tokens: estimateTokens(c.text),
        termFreq: JSON.stringify(tf),
      },
    })

    if (doExtract) {
      try {
        const extracted = await extractDecisions(c.text, c.headingPath)
        for (const d of extracted) {
          await db.decision.create({
            data: {
              noteId: note.id,
              chunkId: chunk.id,
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
          decisionsExtracted++
        }
      } catch {
        // extraction is best-effort; never block ingestion
      }
    }
  }

  await db.note.update({
    where: { id: note.id },
    data: { chunkCount: chunks.length },
  })

  invalidateCorpusCache()

  return NextResponse.json({
    id: note.id,
    title: note.title,
    sourcePath: note.sourcePath,
    chunkCount: chunks.length,
    decisionsExtracted,
    message: `Ingested ${chunks.length} chunks${
      decisionsExtracted > 0 ? `, extracted ${decisionsExtracted} decisions` : ""
    }.`,
  })
}

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m)
  if (m) return m[1].trim()
  return md.trim().split("\n")[0].slice(0, 60) || "Untitled"
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
}
