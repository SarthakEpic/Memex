// Retrieval service: load chunks from DB, build an in-memory BM25 index,
// optionally rerank with the LLM. Returns ContextChunk[] for the LLM.

import { db } from "@/lib/db"
import {
  bm25Score,
  type IndexedChunk,
  type ScoredChunk,
  termFreq,
} from "@/lib/notes"
import { llmRerank, type ContextChunk } from "@/lib/llm"

const cache = new Map<string, { ts: number; chunks: IndexedChunk[] }>()
const CACHE_TTL = 5_000 // 5s — short so fresh ingest shows up quickly

async function loadCorpus(userId: string): Promise<IndexedChunk[]> {
  const current = cache.get(userId)
  if (current && Date.now() - current.ts < CACHE_TTL) return current.chunks
  const chunks = await db.chunk.findMany({
    where: { userId },
    include: { note: true },
  })
  const indexed: IndexedChunk[] = chunks.map((c) => ({
    id: c.id,
    text: c.text,
    headingPath: c.headingPath,
    chunkIndex: c.chunkIndex,
    noteId: c.noteId,
    sourcePath: c.note.sourcePath,
    termFreq: safeParse(c.termFreq, {}),
    tokens: c.tokens,
  }))
  cache.set(userId, { ts: Date.now(), chunks: indexed })
  return indexed
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export async function retrieve(
  query: string,
  opts: { userId: string; topK?: number; rerank?: boolean }
): Promise<ContextChunk[]> {
  const topK = opts.topK ?? 6
  const corpus = await loadCorpus(opts.userId)
  if (corpus.length === 0) return []

  const scored: ScoredChunk[] = bm25Score(query, corpus, Math.max(topK * 3, 15))
  if (scored.length === 0) return []

  let top = scored.slice(0, topK * 2).map<ContextChunk>((s) => ({
    id: s.id,
    sourcePath: s.sourcePath,
    headingPath: s.headingPath,
    chunkIndex: s.chunkIndex,
    text: s.text,
    score: s.score,
  }))

  if (opts.rerank && top.length > 1) {
    top = await llmRerank(query, top)
  }

  return top.slice(0, topK)
}

// Invalidate cache after ingest.
export function invalidateCorpusCache(userId?: string): void {
  if (userId) {
    cache.delete(userId)
  } else {
    cache.clear()
  }
}

// Stats for the dashboard / retrieval-health panel.
export async function corpusStats(userId: string): Promise<{
  chunkCount: number
  noteCount: number
  avgTokensPerChunk: number
  uniqueTerms: number
}> {
  const corpus = await loadCorpus(userId)
  const noteCount = await db.note.count({ where: { userId } })
  const terms = new Set<string>()
  let totalTokens = 0
  for (const c of corpus) {
    totalTokens += c.tokens
    for (const t of Object.keys(c.termFreq)) terms.add(t)
  }
  return {
    chunkCount: corpus.length,
    noteCount,
    avgTokensPerChunk: corpus.length ? Math.round(totalTokens / corpus.length) : 0,
    uniqueTerms: terms.size,
  }
}
