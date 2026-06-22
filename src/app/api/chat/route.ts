import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { retrieve } from "@/lib/retrieval"
import { generateCitedAnswer, type ContextChunk } from "@/lib/llm"

// POST /api/chat
// Body: { message: string, sessionId?: string, rerank?: boolean }
// Returns: { sessionId, answer, citations, refused }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { message, sessionId, rerank = true } = body as {
    message?: string
    sessionId?: string
    rerank?: boolean
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
  const chunks: ContextChunk[] = await retrieve(message, { topK: 6, rerank })

  // Build conversation history
  const history = await db.chatMessage.findMany({
    where: { sessionId: session.id, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
    take: 8,
  })
  const historyClean = history
    .slice(0, -1) // exclude the just-stored user message (we pass it separately)
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }))

  // Generate cited answer
  const { answer, citedChunkIds, refused, serviceError } = await generateCitedAnswer(
    message,
    chunks,
    historyClean
  )

  // Build citation metadata for the UI
  const citations = chunks
    .filter((c) => citedChunkIds.includes(c.id))
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
    cited: citedChunkIds.includes(c.id),
  }))

  // Store assistant message with citations
  await db.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: answer,
      citations: JSON.stringify(citations),
    },
  })

  return NextResponse.json({
    sessionId: session.id,
    answer,
    citations,
    context,
    refused,
    serviceError,
    retrievalCount: chunks.length,
  })
}
