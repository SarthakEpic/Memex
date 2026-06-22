// Shared note ingestion logic — used by POST /api/notes and PATCH /api/notes/[id].
// Chunks a note's markdown content, stores chunks with BM25 term frequencies,
// and optionally extracts decisions via the LLM.

import { db } from "@/lib/db"
import {
  chunkMarkdown,
  contentHash,
  termFreq,
  estimateTokens,
} from "@/lib/notes"
import { extractDecisions } from "@/lib/llm"
import { invalidateCorpusCache } from "@/lib/retrieval"

export interface IngestOptions {
  title: string
  content: string
  project?: string
  tags?: string[]
  sourcePath: string
  extractDecisions?: boolean
}

export interface IngestResult {
  noteId: string
  title: string
  sourcePath: string
  chunkCount: number
  decisionsExtracted: number
}

// Re-chunk + re-extract decisions for an existing note (deletes old chunks
// and decisions first). Used when editing a note's content.
export async function reingestNote(noteId: string, opts: IngestOptions): Promise<IngestResult> {
  const hash = await contentHash(opts.content)

  // Delete old chunks + decisions
  await db.decision.deleteMany({ where: { noteId } })
  await db.chunk.deleteMany({ where: { noteId } })

  // Update the note record
  await db.note.update({
    where: { id: noteId },
    data: {
      title: opts.title,
      content: opts.content,
      project: opts.project || "general",
      tags: (opts.tags || []).join(","),
      contentHash: hash,
      updatedAt: new Date(),
    },
  })

  const chunks = chunkMarkdown(opts.content, opts.title)
  let decisionsExtracted = 0

  for (const c of chunks) {
    const tf = termFreq(c.text)
    const chunk = await db.chunk.create({
      data: {
        noteId,
        chunkIndex: c.chunkIndex,
        text: c.text,
        headingPath: c.headingPath,
        tokens: estimateTokens(c.text),
        termFreq: JSON.stringify(tf),
      },
    })

    if (opts.extractDecisions !== false) {
      try {
        const extracted = await extractDecisions(c.text, c.headingPath)
        for (const d of extracted) {
          await db.decision.create({
            data: {
              noteId,
              chunkId: chunk.id,
              title: d.title,
              decisionDate: d.decisionDate || "",
              rationale: d.rationale,
              alternatives: (d.alternatives || []).join("|"),
              outcome: d.outcome || "",
              participants: (d.participants || []).join("|"),
              project: opts.project || "general",
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
    where: { id: noteId },
    data: { chunkCount: chunks.length },
  })

  invalidateCorpusCache()

  return {
    noteId,
    title: opts.title,
    sourcePath: opts.sourcePath,
    chunkCount: chunks.length,
    decisionsExtracted,
  }
}
