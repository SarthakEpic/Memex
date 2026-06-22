// LLM utilities: citation-enforced answering + decision extraction.
// Uses z-ai-web-dev-sdk chat completions (server-side only).

import ZAI from "z-ai-web-dev-sdk"

let zaiPromise: Promise<ZAI> | null = null
function getClient(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create()
  return zaiPromise
}

export interface ContextChunk {
  id: string
  sourcePath: string
  headingPath: string
  chunkIndex: number
  text: string
  score: number
}

export interface CitedAnswer {
  answer: string
  citedChunkIds: string[]
  refused: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Citation-first prompt (the critical differentiator)
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Memex, a citation-first knowledge assistant. You answer questions using ONLY the provided context chunks. You must cite the source of every claim using inline markers [^chunk_id].

RULES:
1. Every factual statement MUST be followed by [^<chunk_id>].
2. If the context does not contain information to answer, say exactly: "I don't have a source for this."
3. Never use outside knowledge. Never speculate.
4. If multiple chunks support a claim, cite all of them: [^a] [^b].
5. Keep answers under 200 words. Be concrete, not verbose.
6. Use Markdown formatting for readability (headings, lists, bold).`

function buildContextBlock(chunks: ContextChunk[]): string {
  return chunks
    .map((c) => {
      return `[chunk_id: ${c.id}]
source: ${c.sourcePath}${c.headingPath ? ` (section: ${c.headingPath})` : ""}
---
${c.text}`
    })
    .join("\n\n")
}

export async function generateCitedAnswer(
  question: string,
  chunks: ContextChunk[],
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<CitedAnswer> {
  if (chunks.length === 0) {
    return {
      answer: "I don't have a source for this.",
      citedChunkIds: [],
      refused: true,
    }
  }

  const contextBlock = buildContextBlock(chunks)
  const userPrompt = `CONTEXT CHUNKS:
${contextBlock}

QUESTION: ${question}

ANSWER (with [^chunk_id] citations):`

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userPrompt },
  ]

  const zai = await getClient()
  let raw = ""
  try {
    const completion = await zai.chat.completions.create({
      messages,
      temperature: 0.3,
      max_tokens: 600,
    })
    // SDK returns either a string or an object with choices
    if (typeof completion === "string") {
      raw = completion
    } else if (completion?.choices?.[0]?.message?.content) {
      raw = completion.choices[0].message.content
    } else if (completion?.content) {
      raw = completion.content
    } else {
      raw = String(completion ?? "")
    }
  } catch (err) {
    return {
      answer:
        "I don't have a source for this.\n\n_(The reasoning service is temporarily unavailable.)_",
      citedChunkIds: [],
      refused: true,
    }
  }

  // Post-process: verify every [^chunk_id] marker exists in the provided context.
  const validIds = new Set(chunks.map((c) => c.id))
  const cited = new Set<string>()
  const markerRe = /\[\^([a-z0-9]+)\]/gi
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(raw)) !== null) {
    const id = m[1]
    if (validIds.has(id)) cited.add(id)
  }

  // Detect refusal
  const refused =
    raw.trim().toLowerCase().startsWith("i don't have a source for this") ||
    cited.size === 0

  return {
    answer: raw.trim(),
    citedChunkIds: Array.from(cited),
    refused,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM reranker — semantic re-ranking of BM25 candidates.
// We ask the model to score 0..1 relevance of each candidate to the query.
// Falls back gracefully if the model misbehaves.
// ─────────────────────────────────────────────────────────────────────────────

export async function llmRerank(
  query: string,
  chunks: ContextChunk[]
): Promise<ContextChunk[]> {
  if (chunks.length <= 1) return chunks
  const zai = await getClient()
  const numbered = chunks
    .map((c, i) => `[${i}] ${c.text.slice(0, 400)}`)
    .join("\n")
  const prompt = `Rate the relevance of each candidate passage to the query on a scale of 0.0 to 1.0. Respond ONLY with a JSON array of numbers, one per candidate, in order. No prose.

QUERY: ${query}

CANDIDATES:
${numbered}

JSON scores:`
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a relevance rater. Output only a JSON array of floats between 0 and 1.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 200,
    })
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return chunks
    const scores = JSON.parse(match[0]) as number[]
    if (!Array.isArray(scores) || scores.length !== chunks.length) return chunks
    return chunks
      .map((c, i) => ({ ...c, score: c.score * 0.4 + (scores[i] ?? 0) * 2 }))
      .sort((a, b) => b.score - a.score)
  } catch {
    return chunks
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision extraction (Phase 8 of the spec)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedDecision {
  title: string
  decisionDate: string
  alternatives: string[]
  rationale: string
  outcome: string
  participants: string[]
  confidence: number
}

const DECISION_PROMPT = `You are Memex's decision extractor. Read the following note chunk and extract any decisions it contains. A decision is a statement that X was chosen over Y for reason Z.

If no decision is present, return {"decisions": []}.

If decisions are present, return JSON:
{
  "decisions": [
    {
      "title": "Use Postgres for primary DB",
      "decision_date": "2024-03-14",
      "alternatives": ["Mongo", "SQLite"],
      "rationale": "ACID guarantees matter for financial data",
      "outcome": "Working well 6 months later",
      "participants": ["@me"],
      "confidence": 0.9
    }
  ]
}

Respond with JSON only, no prose. Dates must be ISO format YYYY-MM-DD or null.`

export async function extractDecisions(
  chunkText: string,
  headingPath: string
): Promise<ExtractedDecision[]> {
  const zai = await getClient()
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: DECISION_PROMPT },
        {
          role: "user",
          content: `Heading path: ${headingPath}\n\nNOTE CHUNK:\n${chunkText}\n\nJSON:`,
        },
      ],
      temperature: 0.1,
      max_tokens: 600,
    })
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return []
    const parsed = JSON.parse(match[0]) as { decisions?: ExtractedDecision[] }
    if (!parsed.decisions || !Array.isArray(parsed.decisions)) return []
    return parsed.decisions.filter((d) => d && d.title && d.rationale)
  } catch {
    return []
  }
}
