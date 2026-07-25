import { NextRequest, NextResponse } from "next/server"
import { ingestNote } from "@/server/services/ingestion"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import { chatComplete, transcribeAudio } from "@/lib/ai-client"

// POST /api/notes/audio
// Body: { audio: base64, language: "en" | "hi" | "auto", project?, tags?, extractDecisions? }
// 1. Transcribe audio via the configured AI provider's ASR (Groq Whisper / OpenAI Whisper)
// 2. Detect if Hindi → structure as Hinglish
// 3. Use LLM to structure the raw transcription into a well-formatted Markdown note
// 4. Ingest the structured note (chunk + extract decisions)
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, { name: "notes:audio", limit: 10, windowMs: 60_000, userId: auth.user.id })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const {
    audio,
    language = "auto",
    project = "voice",
    tags = [],
    extractDecisions: doExtract = true,
  } = body as {
    audio?: string
    language?: string
    project?: string
    tags?: string[]
    extractDecisions?: boolean
  }

  if (!audio || typeof audio !== "string") {
    return NextResponse.json({ error: "Audio data (base64) is required" }, { status: 400 })
  }

  // Step 1: Transcribe audio via the AI provider's ASR service
  // (Groq Whisper is free; OpenAI Whisper is paid; Gemini/Ollama don't support ASR)
  const asrResult = await transcribeAudio(audio)
  if (!asrResult.ok) {
    const msg = asrResult.error || "Unknown error"
    if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { error: "Speech recognition service is rate-limited. Please try again in a moment." },
        { status: 429 }
      )
    }
    return NextResponse.json(
      { error: `Transcription failed: ${msg}` },
      { status: 502 }
    )
  }

  const rawTranscription = asrResult.text

  if (!rawTranscription.trim()) {
    return NextResponse.json(
      { error: "No speech detected in the audio. Please try recording again." },
      { status: 422 }
    )
  }

  // Step 2: Structure the transcription with LLM
  // The LLM takes raw speech-to-text and turns it into a clean, organized note.
  // If the speech is in Hindi, it outputs Hinglish (Hindi written in Roman/English script).
  const structuringPrompt = `You are Memex's voice note structuring assistant. The user spoke a voice note which was transcribed. Your job is to turn this raw transcription into a clean, well-structured Markdown note.

RULES:
1. If the transcription is in Hindi (Devanagari or Hindi words in English), write the note in **Hinglish** — Hindi written in Roman/English letters (e.g., "humne Postgres choose kiya kyunki..." instead of "हमने Postgres choose किया क्योंकि..."). Keep technical terms in English.
2. If the transcription is in English, keep it in English.
3. Structure the note with:
   - A clear **# Title** (summarize the main topic in 3-6 words)
   - **## sections** for different topics discussed
   - **Bullet points** for key points
   - **Bold** for important terms or decisions
   - Clean up filler words (um, uh, like, you know)
   - Fix grammar and sentence structure
   - Add logical organization (don't just transcribe — organize)
4. If the user mentions a decision ("we chose X because Y"), make it a clear statement.
5. Keep all factual information — don't invent or remove facts.
6. Add a "> **Voice note** — transcribed and structured by AI" blockquote at the top.

Return ONLY the Markdown note, no explanations.`

  const llmResult = await chatComplete({
    messages: [
      { role: "system", content: structuringPrompt },
      {
        role: "user",
        content: `LANGUAGE HINT: ${language}\n\nRAW TRANSCRIPTION:\n${rawTranscription}\n\nSTRUCTURED MARKDOWN NOTE:`,
      },
    ],
    temperature: 0.3,
    maxTokens: 1000,
  })

  let structuredContent: string
  if (llmResult.ok) {
    structuredContent = llmResult.content
  } else {
    // If LLM fails, use the raw transcription with a basic title
    structuredContent = `# Voice Note\n\n> **Voice note** — transcribed by AI\n\n${rawTranscription}`
  }

  // Step 3: Extract title from structured content
  const titleMatch = structuredContent.match(/^#\s+(.+)$/m)
  const noteTitle = titleMatch ? titleMatch[1].trim() : `Voice Note ${new Date().toLocaleString()}`

  // Step 4: Ingest the structured note
  const sourcePath = `/notes/voice/${slugify(noteTitle)}.md`
  const allTags = [...tags, "voice-note", language === "hi" ? "hinglish" : "english"]

  const result = await ingestNote({
    userId: auth.user.id,
    title: noteTitle,
    content: structuredContent,
    sourcePath,
    project: project || "voice",
    tags: allTags,
    extractDecisions: doExtract,
  })

  return NextResponse.json({
    id: result.id,
    title: noteTitle,
    sourcePath: result.sourcePath,
    rawTranscription,
    structuredContent,
    chunkCount: result.chunkCount,
    decisionsExtracted: result.decisionsExtracted,
    language: language === "hi" ? "hinglish" : "english",
    skipped: result.skipped,
    message: `Voice note transcribed and structured → ${result.chunkCount} chunks${
      result.decisionsExtracted > 0 ? `, ${result.decisionsExtracted} decisions` : ""
    }.`,
  })
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
}
