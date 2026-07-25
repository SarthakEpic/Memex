import { db } from "@/lib/db"
import {
  chunkMarkdown,
  contentHash,
  estimateTokens,
  termFreq,
} from "@/lib/notes"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { extractDecisions } from "@/lib/llm"
import { extractTitle, slugify } from "./ingestion-utils"

export interface IngestNoteInput {
  userId: string
  title?: string
  content: string
  sourcePath?: string
  project?: string
  tags?: string[]
  extractDecisions?: boolean
  skipIfUnchanged?: boolean
}

export interface IngestNoteResult {
  id: string
  title: string
  sourcePath: string
  chunkCount: number
  decisionsExtracted: number
  skipped: boolean
}

export async function ingestNote(input: IngestNoteInput): Promise<IngestNoteResult> {
  const noteTitle = input.title?.trim() || extractTitle(input.content)
  const sourcePath = input.sourcePath || `/notes/${slugify(noteTitle)}.md`
  const hash = await contentHash(input.content)
  const skipIfUnchanged = input.skipIfUnchanged ?? true

  const existing = await db.note.findUnique({
    where: { userId_sourcePath: { userId: input.userId, sourcePath } },
  })
  if (existing && existing.contentHash === hash && skipIfUnchanged) {
    return {
      id: existing.id,
      title: existing.title,
      sourcePath: existing.sourcePath,
      chunkCount: existing.chunkCount,
      decisionsExtracted: 0,
      skipped: true,
    }
  }

  if (existing) {
    await db.decision.deleteMany({
      where: { noteId: existing.id, userId: input.userId },
    })
    await db.chunk.deleteMany({
      where: { noteId: existing.id, userId: input.userId },
    })
  }

  const note = await db.note.upsert({
    where: { userId_sourcePath: { userId: input.userId, sourcePath } },
    create: {
      userId: input.userId,
      title: noteTitle,
      content: input.content,
      sourcePath,
      project: input.project || "general",
      tags: normalizeTags(input.tags).join(","),
      contentHash: hash,
    },
    update: {
      title: noteTitle,
      content: input.content,
      project: input.project || "general",
      tags: normalizeTags(input.tags).join(","),
      contentHash: hash,
      updatedAt: new Date(),
    },
  })

  const chunks = chunkMarkdown(input.content, noteTitle)
  let decisionsExtracted = 0

  for (const c of chunks) {
    const chunk = await db.chunk.create({
      data: {
        userId: input.userId,
        noteId: note.id,
        chunkIndex: c.chunkIndex,
        text: c.text,
        headingPath: c.headingPath,
        tokens: estimateTokens(c.text),
        termFreq: JSON.stringify(termFreq(c.text)),
      },
    })

    if (input.extractDecisions ?? true) {
      try {
        const extracted = await extractDecisions(c.text, c.headingPath)
        for (const d of extracted) {
          await db.decision.create({
            data: {
              userId: input.userId,
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
        // Decision extraction is intentionally best-effort; ingestion must not fail.
      }
    }
  }

  await db.note.update({
    where: { id: note.id },
    data: { chunkCount: chunks.length },
  })

  invalidateCorpusCache(input.userId)

  return {
    id: note.id,
    title: note.title,
    sourcePath: note.sourcePath,
    chunkCount: chunks.length,
    decisionsExtracted,
    skipped: false,
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (tags || [])
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
}
