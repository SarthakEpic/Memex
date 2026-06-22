import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import {
  chunkMarkdown,
  contentHash,
  termFreq,
  estimateTokens,
} from "@/lib/notes"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { extractDecisions, withRetry } from "@/lib/llm"
import { reingestNote } from "@/lib/ingest"

let zaiPromise: Promise<ZAI> | null = null
function getClient(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create()
  return zaiPromise
}

// POST /api/notes/audio
// Body: { audio: base64, language: "en" | "hi" | "auto", project?, tags?, extractDecisions? }
// 1. Transcribe audio via ASR
// 2. Detect if Hindi → structure as Hinglish
// 3. Use LLM to structure the raw transcription into a well-formatted Markdown note
// 4. Ingest the structured note (chunk + extract decisions)
export async function POST(req: NextRequest) {
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

  // Step 1: Transcribe audio
  const zai = await getClient()
  let rawTranscription = ""
  try {
    const asrResult = await withRetry(() =>
      zai.audio.asr.create({ file_base64: audio })
    )
    if (typeof asrResult === "string") {
      rawTranscription = asrResult
    } else if (asrResult?.text) {
      rawTranscription = asrResult.text
    } else {
      rawTranscription = String(asrResult ?? "")
    }
  } catch (err: any) {
    const msg = err?.message || "Unknown error"
    if (msg.includes("429")) {
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

  let structuredContent = ""
  try {
    const result = await withRetry(() =>
      zai.chat.completions.create({
        messages: [
          { role: "system", content: structuringPrompt },
          {
            role: "user",
            content: `LANGUAGE HINT: ${language}\n\nRAW TRANSCRIPTION:\n${rawTranscription}\n\nSTRUCTURED MARKDOWN NOTE:`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      })
    )
    if (result.ok) {
      const completion = result.value
      if (typeof completion === "string") structuredContent = completion
      else if (completion?.choices?.[0]?.message?.content)
        structuredContent = completion.choices[0].message.content
      else structuredContent = String(completion ?? "")
    } else {
      // If LLM fails, use the raw transcription with a basic title
      structuredContent = `# Voice Note\n\n> **Voice note** — transcribed by AI\n\n${rawTranscription}`
    }
  } catch {
    structuredContent = `# Voice Note\n\n> **Voice note** — transcribed by AI\n\n${rawTranscription}`
  }

  // Step 3: Extract title from structured content
  const titleMatch = structuredContent.match(/^#\s+(.+)$/m)
  const noteTitle = titleMatch ? titleMatch[1].trim() : `Voice Note ${new Date().toLocaleString()}`

  // Step 4: Ingest the structured note
  const sourcePath = `/notes/voice/${slugify(noteTitle)}.md`
  const hash = await contentHash(structuredContent)
  const allTags = [...tags, "voice-note", language === "hi" ? "hinglish" : "english"]

  // Check for existing
  const existing = await db.note.findUnique({ where: { sourcePath } })
  if (existing) {
    await db.decision.deleteMany({ where: { noteId: existing.id } })
    await db.chunk.deleteMany({ where: { noteId: existing.id } })
  }

  const note = await db.note.upsert({
    where: { sourcePath },
    create: {
      title: noteTitle,
      content: structuredContent,
      sourcePath,
      project: project || "voice",
      tags: allTags.join(","),
      contentHash: hash,
    },
    update: {
      title: noteTitle,
      content: structuredContent,
      project: project || "voice",
      tags: allTags.join(","),
      contentHash: hash,
      updatedAt: new Date(),
    },
  })

  const chunks = chunkMarkdown(structuredContent, noteTitle)
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
        // best-effort
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
    title: noteTitle,
    sourcePath: note.sourcePath,
    rawTranscription,
    structuredContent,
    chunkCount: chunks.length,
    decisionsExtracted,
    language: language === "hi" ? "hinglish" : "english",
    message: `Voice note transcribed and structured → ${chunks.length} chunks${
      decisionsExtracted > 0 ? `, ${decisionsExtracted} decisions` : ""
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
