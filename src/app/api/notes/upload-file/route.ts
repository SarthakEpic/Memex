import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  chunkMarkdown,
  contentHash,
  termFreq,
  estimateTokens,
} from "@/lib/notes"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { extractDecisions } from "@/lib/llm"

// POST /api/notes/upload-file
// Body: { fileName, fileType, fileBase64, project?, tags?, extractDecisions? }
// Supports: PDF, Word (.docx), PowerPoint (.pptx), plain text, Markdown
// Extracts text → converts to Markdown → ingests as note
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    fileName,
    fileType,
    fileBase64,
    project = "imported",
    tags = [],
    extractDecisions: doExtract = true,
  } = body as {
    fileName?: string
    fileType?: string
    fileBase64?: string
    project?: string
    tags?: string[]
    extractDecisions?: boolean
  }

  if (!fileBase64 || !fileName) {
    return NextResponse.json(
      { error: "fileName and fileBase64 are required" },
      { status: 400 }
    )
  }

  // Decode base64
  const buffer = Buffer.from(fileBase64, "base64")
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""

  let extractedText = ""
  let detectedTitle = fileName.replace(/\.[^.]+$/, "")

  try {
    if (ext === "pdf") {
      extractedText = await extractFromPdf(buffer)
    } else if (ext === "docx") {
      extractedText = await extractFromDocx(buffer)
    } else if (ext === "pptx") {
      extractedText = await extractFromPptx(buffer)
    } else if (ext === "txt" || ext === "md" || ext === "markdown") {
      extractedText = buffer.toString("utf-8")
    } else {
      return NextResponse.json(
        { error: `Unsupported file format: .${ext}. Supported: PDF, DOCX, PPTX, TXT, MD` },
        { status: 400 }
      )
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to extract text from ${ext.toUpperCase()}: ${err.message}` },
      { status: 500 }
    )
  }

  if (!extractedText.trim() || extractedText.trim().length < 20) {
    return NextResponse.json(
      { error: "No readable text found in the file. It might be scanned images or empty." },
      { status: 422 }
    )
  }

  // Convert plain text to basic Markdown structure
  const markdownContent = textToMarkdown(extractedText, detectedTitle)

  // Extract title from first heading
  const titleMatch = markdownContent.match(/^#\s+(.+)$/m)
  const noteTitle = titleMatch ? titleMatch[1].trim() : detectedTitle

  const sourcePath = `/notes/uploaded/${slugify(noteTitle)}.md`
  const hash = await contentHash(markdownContent)
  const allTags = [...tags, "file-import", ext]

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
      content: markdownContent,
      sourcePath,
      project: project || "imported",
      tags: allTags.join(","),
      contentHash: hash,
    },
    update: {
      title: noteTitle,
      content: markdownContent,
      project: project || "imported",
      tags: allTags.join(","),
      contentHash: hash,
      updatedAt: new Date(),
    },
  })

  const chunks = chunkMarkdown(markdownContent, noteTitle)
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
    fileName,
    fileType: ext,
    chunkCount: chunks.length,
    decisionsExtracted,
    message: `Imported "${fileName}" → ${chunks.length} chunks${
      decisionsExtracted > 0 ? `, ${decisionsExtracted} decisions` : ""
    }.`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Text extractors
// ─────────────────────────────────────────────────────────────────────────────

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default
  const data = await pdfParse(buffer)
  return data.text || ""
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ""
}

async function extractFromPptx(buffer: Buffer): Promise<string> {
  // PPTX is a ZIP file containing XML. We parse slide XML to extract text.
  // Using a lightweight approach: unzip → parse slide XMLs → extract text runs.
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.match(/ppt\/slides\/slide\d+\.xml/))
    .sort()

  const texts: string[] = []
  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async("string")
    // Extract text from <a:t> tags
    const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || []
    const slideText = matches
      .map((m) => m.replace(/<\/?a:t>/g, ""))
      .join(" ")
      .trim()
    if (slideText) {
      const slideNum = slideFile.match(/slide(\d+)/)?.[1] ?? "?"
      texts.push(`## Slide ${slideNum}\n\n${slideText}`)
    }
  }
  return texts.join("\n\n")
}

// Convert plain text to structured Markdown
function textToMarkdown(text: string, fallbackTitle: string): string {
  const lines = text.split("\n").map((l) => l.trim())
  const result: string[] = []

  // Try to detect a title from the first non-empty line
  let title = fallbackTitle
  let startIdx = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) {
      // If first line is short (< 100 chars) and has no period, use as title
      if (lines[i].length < 100 && !lines[i].includes(".")) {
        title = lines[i]
        startIdx = i + 1
      }
      break
    }
  }

  result.push(`# ${title}`)
  result.push("")
  result.push(`> **Imported file** — extracted and structured by AI`)
  result.push("")

  // Group remaining lines into paragraphs and detect potential headings
  let currentPara: string[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      if (currentPara.length > 0) {
        result.push(currentPara.join(" "))
        result.push("")
        currentPara = []
      }
    } else {
      // Heuristic: short lines without ending punctuation might be headings
      if (
        line.length < 80 &&
        !line.endsWith(".") &&
        !line.endsWith(",") &&
        !line.endsWith(";") &&
        currentPara.length === 0 &&
        result[result.length - 1] === "" &&
        result.length > 3
      ) {
        // Flush previous paragraph
        if (currentPara.length > 0) {
          result.push(currentPara.join(" "))
          result.push("")
          currentPara = []
        }
        result.push(`## ${line}`)
        result.push("")
      } else {
        currentPara.push(line)
      }
    }
  }
  if (currentPara.length > 0) {
    result.push(currentPara.join(" "))
  }

  return result.join("\n").trim()
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
}
