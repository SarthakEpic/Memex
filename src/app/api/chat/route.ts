import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { retrieve } from "@/lib/retrieval"
import { generateSmartAnswer, type ContextChunk } from "@/lib/llm"

// POST /api/chat
// Body: { message: string, sessionId?: string }
// Returns: { sessionId, answer, citations, mode, refused, serviceError }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { message, sessionId } = body as {
    message?: string
    sessionId?: string
  }

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 })
  }

  // Get or create session
  let session = sessionId
    ? await db.chatSession.findUnique({ where: { id: sessionId } })
    : null
  if (!session) {
    session = await db.chatSession.create({
      data: { title: message.slice(0, 60) },
    })
  }

  // Store user message
  await db.chatMessage.create({
    data: { sessionId: session.id, role: "user", content: message },
  })

  // Retrieve context chunks (BM25 + optional LLM rerank)
  // Only retrieve if the message looks like it might be about notes
  const lowerMsg = message.toLowerCase()
  const mightBeAboutNotes =
    lowerMsg.includes("why") ||
    lowerMsg.includes("how") ||
    lowerMsg.includes("what") ||
    lowerMsg.includes("decide") ||
    lowerMsg.includes("decision") ||
    lowerMsg.includes("pick") ||
    lowerMsg.includes("choose") ||
    lowerMsg.includes("note") ||
    lowerMsg.includes("postgres") ||
    lowerMsg.includes("redis") ||
    lowerMsg.includes("keycloak") ||
    lowerMsg.includes("cache") ||
    lowerMsg.includes("llm") ||
    lowerMsg.includes("auth") ||
    lowerMsg.includes("vector") ||
    lowerMsg.includes("embedding") ||
    lowerMsg.includes("rerank") ||
    lowerMsg.includes("observ") ||
    lowerMsg.includes("frontend") ||
    lowerMsg.includes("database") ||
    lowerMsg.includes("?")

  // Retrieve context chunks — SKIP reranking to avoid an extra LLM call
  // that could hit rate limits. BM25-only retrieval is fast and reliable.
  const chunks: ContextChunk[] = mightBeAboutNotes
    ? await retrieve(message, { topK: 6, rerank: false })
    : []

  // Build conversation history
  const history = await db.chatMessage.findMany({
    where: { sessionId: session.id, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
    take: 12,
  })
  const historyClean = history
    .slice(0, -1) // exclude the just-stored user message (we pass it separately)
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }))

  // Build email context from recent inbox emails (if any)
  let emailContext = ""
  try {
    const recentEmails = await db.inboxEmail.findMany({
      orderBy: { receivedAt: "desc" },
      take: 5,
    })
    if (recentEmails.length > 0) {
      emailContext = recentEmails
        .map(
          (e) =>
            `[${e.category}] FROM: ${e.fromAddress} | SUBJECT: ${e.subject}\n${e.body.slice(0, 300)}`
        )
        .join("\n\n")
    }
  } catch {
    // inboxEmail table might not exist yet
  }

  // Generate smart answer (multi-mode)
  const { answer, mode, citedChunkIds, refused, serviceError } =
    await generateSmartAnswer(message, chunks, historyClean, emailContext || undefined)

  // If the LLM was rate-limited, generate a fallback answer from BM25 results
  // so the user still gets something useful instead of just an error message.
  const finalAnswer = serviceError
    ? generateFallbackAnswer(message, chunks)
    : answer
  const finalMode = serviceError ? "note_qa" : mode
  const finalCitedChunkIds = serviceError
    ? chunks.slice(0, 3).map((c) => c.id)
    : citedChunkIds
  const finalRefused = serviceError ? false : refused

  // Build citation metadata for the UI
  const citations = chunks
    .filter((c) => finalCitedChunkIds.includes(c.id))
    .map((c) => ({
      chunkId: c.id,
      sourcePath: c.sourcePath,
      headingPath: c.headingPath,
      chunkIndex: c.chunkIndex,
      snippet: c.text.slice(0, 220) + (c.text.length > 220 ? "…" : ""),
      score: Number(c.score.toFixed(4)),
    }))

  // Also include all retrieved chunks as "context" even if uncited
  const context = chunks.map((c) => ({
    chunkId: c.id,
    sourcePath: c.sourcePath,
    headingPath: c.headingPath,
    chunkIndex: c.chunkIndex,
    score: Number(c.score.toFixed(4)),
    cited: finalCitedChunkIds.includes(c.id),
  }))

  // Store assistant message with citations
  await db.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: finalAnswer,
      citations: JSON.stringify(citations),
    },
  })

  return NextResponse.json({
    sessionId: session.id,
    answer: finalAnswer,
    citations,
    context,
    mode: finalMode,
    refused: finalRefused,
    serviceError: false, // We handled the error with a fallback
    retrievalCount: chunks.length,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback answer generator — when the LLM is completely rate-limited,
// we generate a basic answer from BM25 search results so the user still
// gets useful information instead of just an error message.
// ─────────────────────────────────────────────────────────────────────────────

function generateFallbackAnswer(question: string, chunks: ContextChunk[]): string {
  if (chunks.length === 0) {
    return "I'm currently rate-limited and can't process your question right now. Please try again in a minute. Meanwhile, you can browse your notes directly in the Notes section."
  }

  const topChunks = chunks.slice(0, 3)
  const lines: string[] = []

  lines.push("⚠️ **AI rate-limited — showing BM25 search results instead.**")
  lines.push("")
  lines.push(`I found **${chunks.length} relevant chunk${chunks.length !== 1 ? "s" : ""}** from your notes that match your question. Here are the top ${topChunks.length}:`)
  lines.push("")

  topChunks.forEach((c, i) => {
    lines.push(`### ${i + 1}. ${c.sourcePath}${c.headingPath ? ` › ${c.headingPath}` : ""}`)
    lines.push("")
    lines.push(c.text.slice(0, 300) + (c.text.length > 300 ? "…" : ""))
    lines.push("")
    lines.push(`[^${c.id}]`)
    lines.push("")
  })

  lines.push("---")
  lines.push("_The AI reasoning service is temporarily unavailable. These are raw search results from your notes. Try asking again in a minute for a full AI-generated answer._")

  return lines.join("\n")
}
