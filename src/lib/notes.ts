// Markdown-aware chunker + token estimator + BM25 index utilities.
// No external embedding API available in sandbox, so we use BM25 over
// precomputed term frequencies stored on each Chunk.

export interface ChunkText {
  text: string
  headingPath: string
  chunkIndex: number
}

// Rough token estimate: 1 token ~= 4 chars. Good enough for chunk sizing.
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4))
}

// Tokenize for BM25: lowercase, strip punctuation, split on whitespace.
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

// Term frequency map.
export function termFreq(text: string): Record<string, number> {
  const tokens = tokenize(text)
  const map: Record<string, number> = {}
  for (const t of tokens) map[t] = (map[t] ?? 0) + 1
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown chunker
// Splits on H2 (##) boundaries first; if a section > MAX_TOKENS, split by
// paragraph; if a paragraph > MAX_TOKENS, split by sentence.
// Target chunk size: ~512 tokens. Overlap: 1 sentence.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TOKENS = 512
const MIN_TOKENS = 40

function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function splitBySentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function chunkMarkdown(markdown: string, docTitle = ""): ChunkText[] {
  const chunks: ChunkText[] = []
  let h1 = docTitle

  // Capture an H1 if present at the top.
  const h1Match = markdown.match(/^#\s+(.+)$/m)
  if (h1Match) h1 = h1Match[1].trim()

  // Split on H2 boundaries, keeping the heading text.
  const sections = markdown.split(/^(?=##\s+)/m)

  let chunkIndex = 0

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    // Detect H2 heading → headingPath
    let h2 = ""
    let body = trimmed
    const h2Match = trimmed.match(/^##\s+(.+)$/m)
    if (h2Match) {
      h2 = h2Match[1].trim()
      body = trimmed.slice(h2Match[0].length).trim()
    } else if (trimmed.startsWith("# ")) {
      // Pure H1 section, skip (already captured as doc title)
      body = trimmed.replace(/^#\s+.+$/m, "").trim()
    }

    const headingPath = [h1, h2].filter(Boolean).join(" > ")
    const sectionTokens = estimateTokens(body)

    if (sectionTokens <= MAX_TOKENS) {
      if (body && estimateTokens(body) >= MIN_TOKENS) {
        chunks.push({ text: body, headingPath, chunkIndex: chunkIndex++ })
      } else if (body) {
        chunks.push({ text: body, headingPath, chunkIndex: chunkIndex++ })
      }
      continue
    }

    // Section too big → split by paragraph, then greedily pack.
    const paragraphs = splitByParagraphs(body)
    let buffer = ""
    let bufferTokens = 0

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para)

      if (paraTokens > MAX_TOKENS) {
        // Flush buffer first
        if (buffer) {
          chunks.push({ text: buffer.trim(), headingPath, chunkIndex: chunkIndex++ })
          buffer = ""
          bufferTokens = 0
        }
        // Split paragraph by sentence with overlap
        const sentences = splitBySentences(para)
        let sBuf = ""
        let sBufTokens = 0
        let lastSentence = ""
        for (const s of sentences) {
          const sTokens = estimateTokens(s)
          if (sBufTokens + sTokens > MAX_TOKENS && sBuf) {
            chunks.push({ text: sBuf.trim(), headingPath, chunkIndex: chunkIndex++ })
            // Overlap: start new buffer with previous sentence
            sBuf = lastSentence + " "
            sBufTokens = estimateTokens(lastSentence)
          }
          sBuf += s + " "
          sBufTokens += sTokens
          lastSentence = s
        }
        if (sBuf.trim()) {
          chunks.push({ text: sBuf.trim(), headingPath, chunkIndex: chunkIndex++ })
        }
        continue
      }

      if (bufferTokens + paraTokens > MAX_TOKENS && buffer) {
        chunks.push({ text: buffer.trim(), headingPath, chunkIndex: chunkIndex++ })
        buffer = ""
        bufferTokens = 0
      }
      buffer += para + "\n\n"
      bufferTokens += paraTokens
    }
    if (buffer.trim()) {
      chunks.push({ text: buffer.trim(), headingPath, chunkIndex: chunkIndex++ })
    }
  }

  // If nothing was chunked (no headings), treat whole doc as one chunk.
  if (chunks.length === 0 && markdown.trim()) {
    chunks.push({ text: markdown.trim(), headingPath: h1, chunkIndex: 0 })
  }

  return chunks
}

// ─────────────────────────────────────────────────────────────────────────────
// BM25 scoring (in-memory, computed at query time from stored termFreq)
// ─────────────────────────────────────────────────────────────────────────────

export interface IndexedChunk {
  id: string
  text: string
  headingPath: string
  chunkIndex: number
  noteId: string
  sourcePath: string
  termFreq: Record<string, number>
  tokens: number
}

export interface ScoredChunk extends IndexedChunk {
  score: number
  snippet: string
}

const BM25_K1 = 1.5
const BM25_B = 0.75

export function bm25Score(
  query: string,
  corpus: IndexedChunk[],
  topK = 8
): ScoredChunk[] {
  if (corpus.length === 0) return []
  const queryTerms = tokenize(query)
  if (queryTerms.length === 0) return []

  const N = corpus.length
  const avgDl = corpus.reduce((sum, c) => sum + c.tokens, 0) / N
  // Document frequency per term
  const df: Record<string, number> = {}
  for (const c of corpus) {
    for (const term of Object.keys(c.termFreq)) {
      df[term] = (df[term] ?? 0) + 1
    }
  }

  const scored: ScoredChunk[] = corpus.map((c) => {
    let score = 0
    for (const term of queryTerms) {
      const tf = c.termFreq[term] ?? 0
      if (tf === 0) continue
      const idf = Math.log(1 + (N - (df[term] ?? 0) + 0.5) / ((df[term] ?? 0) + 0.5))
      const numerator = tf * (BM25_K1 + 1)
      const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (c.tokens / avgDl))
      score += idf * (numerator / denominator)
    }
    return { ...c, score, snippet: makeSnippet(c.text, queryTerms) }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function makeSnippet(text: string, queryTerms: string[], maxLen = 220): string {
  const lower = text.toLowerCase()
  let bestPos = -1
  for (const t of queryTerms) {
    const idx = lower.indexOf(t)
    if (idx !== -1 && (bestPos === -1 || idx < bestPos)) bestPos = idx
  }
  if (bestPos === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "")
  const start = Math.max(0, bestPos - 60)
  const end = Math.min(text.length, start + maxLen)
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "")
}

// sha256 content hash for change detection
export async function contentHash(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest("SHA-256", enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
