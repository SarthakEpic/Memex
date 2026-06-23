import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { retrieve } from "@/lib/retrieval"
import {
  generateSmartAnswer,
  draftEmailFromInstruction,
  type ContextChunk,
  type EmailDraftResult,
} from "@/lib/llm"

// POST /api/chat
// Body: { message: string, sessionId?: string }
// Returns: { sessionId, answer, citations, mode, refused, serviceError, emailDraft? }
//
// Email intent detection: if the user is asking to send/draft/compose an email,
// we call `draftEmailFromInstruction()` to produce a STRUCTURED draft
// (recipient, subject, body) that the UI renders as an interactive preview card.
// The draft body is EXACTLY what gets sent when the user clicks "Send Email".
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

  // Build conversation history (last 20 messages)
  const history = await db.chatMessage.findMany({
    where: { sessionId: session.id, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
    take: 20,
  })
  const historyClean = history
    .slice(0, -1) // exclude the just-stored user message
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }))

  // Build email context from recent inbox emails (keep it SHORT)
  let emailContext = ""
  try {
    const recentEmails = await db.inboxEmail.findMany({
      orderBy: { receivedAt: "desc" },
      take: 3,
    })
    if (recentEmails.length > 0) {
      emailContext = recentEmails
        .map(
          (e) =>
            `[${e.category}] FROM: ${e.fromName || e.fromAddress} | SUBJECT: ${e.subject}`
        )
        .join("\n")
    }
  } catch {
    // inboxEmail table might not exist yet
  }

  // ───────────────────────────────────────────────────────────────────────
  // EMAIL INTENT DETECTION — check if the user wants to send/draft an email
  // ───────────────────────────────────────────────────────────────────────
  const lowerMsg = message.toLowerCase().trim()
  const emailIntentKeywords = [
    "send email", "send an email", "send a email", "send mail",
    "email to", "compose email", "compose an email",
    "draft email", "draft an email", "write email", "write an email",
    "mail to", "write to", "reply to",
    "send a message to", "send message to",
  ]
  // Phrases that clearly indicate "draft me an email" intent
  const wantsEmail = emailIntentKeywords.some((kw) => lowerMsg.includes(kw))
  // But skip if it's clearly a question ABOUT email (e.g., "how do I send email?")
  const isQuestionAboutEmail =
    (lowerMsg.includes("how do i") || lowerMsg.includes("how to") || lowerMsg.includes("what is")) &&
    !lowerMsg.includes(" to ")

  // Intent flags for general conversation detection
  const generalPhrases = [
    "hi", "hello", "hey", "thanks", "thank you", "bye", "good morning",
    "good afternoon", "good evening", "how are you", "what's up", "sup",
    "what can you do", "who are you", "what are you", "help me",
    "what is memex", "about this app", "how does this work",
  ]
  const isGeneral = !wantsEmail && generalPhrases.some(
    (phrase) =>
      lowerMsg === phrase ||
      lowerMsg.startsWith(phrase + " ") ||
      lowerMsg.startsWith(phrase + "?") ||
      lowerMsg.startsWith(phrase + "!")
  )

  // ───────────────────────────────────────────────────────────────────────
  // PATH A: EMAIL DRAFT — generate a structured draft for the chat UI
  // ───────────────────────────────────────────────────────────────────────
  if (wantsEmail && !isQuestionAboutEmail) {
    const draft = await draftEmailFromInstruction(message, emailContext || undefined)

    if (draft) {
      // Short, action-oriented assistant message — the actual email content
      // lives in the structured `emailDraft` payload, NOT in the chat text.
      const recipientLabel =
        draft.recipient === "me" ? "yourself" : draft.recipient
      const answer = `I've drafted an email to **${recipientLabel}**. Review the preview below — you can edit any field inline, regenerate with feedback, or send it as-is.\n\n*Rationale:* ${draft.rationale}`

      const emailDraftPayload: EmailDraftPayload = {
        recipient: draft.recipient,
        subject: draft.subject,
        bodyMarkdown: draft.bodyMarkdown,
        rationale: draft.rationale,
        status: "draft",
        timeline: [
          {
            action: "Draft Generated",
            timestamp: new Date().toISOString(),
            details: `Initial draft generated for ${recipientLabel}`,
          },
        ],
      }

      // Store assistant message with the draft attached
      await db.chatMessage.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: answer,
          citations: "[]",
          emailDraft: JSON.stringify(emailDraftPayload),
        },
      })

      return NextResponse.json({
        sessionId: session.id,
        answer,
        citations: [],
        context: [],
        mode: "email",
        refused: false,
        serviceError: false,
        retrievalCount: 0,
        emailDraft: emailDraftPayload,
      })
    }
    // If draft generation failed (rate limit, etc.), fall through to normal chat
  }

  // ───────────────────────────────────────────────────────────────────────
  // PATH B: NORMAL CHAT — note Q&A, app help, general conversation
  // ───────────────────────────────────────────────────────────────────────

  // Retrieve context chunks (BM25)
  const noteKeywords = [
    "why", "how did", "what did", "decide", "decision", "pick", "choose",
    "postgres", "redis", "keycloak", "cache", "llm", "auth", "vector",
    "embedding", "rerank", "observ", "frontend", "database", "os module",
    "system call", "notes", "document", "architecture", "strategy",
    "stack", "framework", "library", "technology", "approach", "rationale",
    "alternative", "tradeoff", "comparison", "benchmark",
  ]
  const lastAssistantMsg = [...history].reverse().find((m) => m.role === "assistant")
  const lastWasAboutNotes = (lastAssistantMsg as any)?.content?.includes("[^") || false
  const hasQuestionMark = lowerMsg.includes("?")
  const hasNoteKeyword = noteKeywords.some((kw) => lowerMsg.includes(kw))
  const mightBeAboutNotes = !isGeneral && (hasQuestionMark || hasNoteKeyword || lastWasAboutNotes)

  const chunks: ContextChunk[] = mightBeAboutNotes
    ? await retrieve(message, { topK: 6, rerank: false })
    : []

  // Generate smart answer (multi-mode)
  const { answer, mode, citedChunkIds, refused, serviceError } =
    await generateSmartAnswer(message, chunks, historyClean, emailContext || undefined)

  // Fallback answer if rate-limited
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

  const context = chunks.map((c) => ({
    chunkId: c.id,
    sourcePath: c.sourcePath,
    headingPath: c.headingPath,
    chunkIndex: c.chunkIndex,
    score: Number(c.score.toFixed(4)),
    cited: finalCitedChunkIds.includes(c.id),
  }))

  // Store assistant message
  await db.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: finalAnswer,
      citations: JSON.stringify(citations),
      emailDraft: "",
    },
  })

  return NextResponse.json({
    sessionId: session.id,
    answer: finalAnswer,
    citations,
    context,
    mode: finalMode,
    refused: finalRefused,
    serviceError: false,
    retrievalCount: chunks.length,
  })
}

// Shape of the emailDraft payload sent to the client and persisted on the
// ChatMessage row. Kept here (and mirrored in the client types) so the
// contract between server and UI is explicit.
export interface EmailDraftPayload {
  recipient: string
  subject: string
  bodyMarkdown: string
  rationale: string
  status: "draft" | "sending" | "sent" | "failed" | "scheduled" | "cancelled"
  timeline: {
    action: string
    timestamp: string
    details?: string
  }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback answer generator — when the LLM is completely rate-limited,
// we generate a basic answer from BM25 search results.
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
