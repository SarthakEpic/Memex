import { NextRequest, NextResponse } from "next/server"
import { ingestNote } from "@/server/services/ingestion"
import { slugify } from "@/server/services/ingestion-utils"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import { uploadFileSchema, validationError } from "@/server/validation/api"

// Allow large file uploads (PPTX/PDF can be 10-50MB)
export const maxDuration = 60 // 60 second timeout
export const runtime = "nodejs"

// POST /api/notes/upload-file
// Body: { fileName, fileType, fileBase64, project?, tags?, extractDecisions? }
// Supports: PDF, Word (.docx), PowerPoint (.pptx), plain text, Markdown
// Extracts text → converts to Markdown → ingests as a note
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, { name: "notes:upload-file", limit: 20, windowMs: 60_000, userId: auth.user.id })
  if (limited) return limited

  // Read the body as text first to handle large payloads
  const bodyText = await req.text()
  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = uploadFileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { fileName, fileType, fileBase64, project, tags, extractDecisions } = parsed.data

  // Decode base64
  const buffer = Buffer.from(fileBase64, "base64")
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  const allowedExtensions = new Set(["pdf", "docx", "pptx", "txt", "md", "markdown"])
  if (!allowedExtensions.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file format: .${ext}. Supported: PDF, DOCX, PPTX, TXT, MD` },
      { status: 400 }
    )
  }

  // File size check (50MB max)
  const fileSizeMB = buffer.length / (1024 * 1024)
  if (fileSizeMB > 50) {
    return NextResponse.json(
      { error: `File too large: ${fileSizeMB.toFixed(1)}MB. Maximum is 50MB.` },
      { status: 413 }
    )
  }

  let extractedText = ""
  let detectedTitle = fileName.replace(/\.[^.]+$/, "")

  // Timeout wrapper — if extraction takes > 30s, fail gracefully
  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Extraction timed out after ${ms / 1000}s`)), ms)
      ),
    ])
  }

  try {
    if (ext === "pdf") {
      extractedText = await withTimeout(extractFromPdf(buffer), 30000)
    } else if (ext === "docx") {
      extractedText = await withTimeout(extractFromDocx(buffer), 30000)
    } else if (ext === "pptx") {
      extractedText = await withTimeout(extractFromPptx(buffer), 30000)
    } else if (ext === "txt" || ext === "md" || ext === "markdown") {
      extractedText = buffer.toString("utf-8")
    }
  } catch (err: any) {
    const msg = err?.message || "Unknown error"
    return NextResponse.json(
      {
        error: `Failed to extract text from ${ext.toUpperCase()}: ${msg}. ${
          msg.includes("timed out")
            ? "The file may be too complex or large. Try a smaller file."
            : ""
        }`,
      },
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
  const allTags = [...tags, "file-import", ext]

  const result = await ingestNote({
    userId: auth.user.id,
    title: noteTitle,
    content: markdownContent,
    sourcePath,
    project,
    tags: allTags,
    extractDecisions,
  })

  return NextResponse.json({
    id: result.id,
    title: noteTitle,
    sourcePath: result.sourcePath,
    fileName,
    fileType: ext,
    chunkCount: result.chunkCount,
    decisionsExtracted: result.decisionsExtracted,
    skipped: result.skipped,
    message: result.skipped
      ? `Imported "${fileName}" already matches the existing note.`
      : `Imported "${fileName}" → ${result.chunkCount} chunks${
          result.decisionsExtracted > 0 ? `, ${result.decisionsExtracted} decisions` : ""
        }.`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Text extractors
// ─────────────────────────────────────────────────────────────────────────────

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: buffer })
  try {
    const data = await parser.getText()
    return data.text || ""
  } finally {
    await parser.destroy()
  }
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ""
}

async function extractFromPptx(buffer: Buffer): Promise<string> {
  // PPTX is a ZIP file containing XML. We parse slide XML to extract text.
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(buffer, { createFolders: false })

  // Find all slide XML files (handles both ppt/slides/ patterns)
  const allFiles = Object.keys(zip.files)
  const slideFiles = allFiles
    .filter((name) => /ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0")
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0")
      return numA - numB
    })

  if (slideFiles.length === 0) {
    const hasXml = allFiles.some((f) => f.endsWith(".xml"))
    if (!hasXml) {
      throw new Error(
        "This doesn't appear to be a valid PowerPoint file. It may be an older .ppt format (only .pptx is supported)."
      )
    }
    throw new Error("No slides found in the PowerPoint file.")
  }

  // Also try to extract speaker notes
  const notesFiles = allFiles
    .filter((name) => /ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort()

  const texts: string[] = []
  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i]
    try {
      const xml = await zip.files[slideFile].async("string")
      // Extract text from <a:t> tags
      const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || []
      const slideText = matches
        .map((m) => m.replace(/<\/a:t>/g, "").replace(/<a:t>/g, ""))
        .join(" ")
        .trim()

      // Also extract paragraphs for better structure
      const paraMatches = xml.match(/<a:p>[\s\S]*?<\/a:p>/g) || []
      const paragraphs = paraMatches
        .map((p) => {
          const textMatches = p.match(/<a:t>([^<]*)<\/a:t>/g) || []
          return textMatches.map((m) => m.replace(/<\/a:t>/g, "").replace(/<a:t>/g, "")).join("")
        })
        .filter((p) => p.trim())

      const slideNum = slideFile.match(/slide(\d+)/i)?.[1] ?? String(i + 1)
      let slideContent = `## Slide ${slideNum}\n\n`

      if (paragraphs.length > 0) {
        slideContent += paragraphs.join("\n\n")
      } else if (slideText) {
        slideContent += slideText
      }

      // Try to get speaker notes
      const notesFile = notesFiles.find((n) => {
        const notesNum = n.match(/notesSlide(\d+)/i)?.[1]
        return notesNum === slideNum
      })
      if (notesFile) {
        try {
          const notesXml = await zip.files[notesFile].async("string")
          const notesMatches = notesXml.match(/<a:t>([^<]*)<\/a:t>/g) || []
          const notesText = notesMatches
            .map((m) => m.replace(/<\/a:t>/g, "").replace(/<a:t>/g, ""))
            .join(" ")
            .trim()
          if (notesText) {
            slideContent += `\n\n> **Speaker notes:** ${notesText}`
          }
        } catch {
          // skip notes if they fail
        }
      }

      if (slideText || paragraphs.length > 0) {
        texts.push(slideContent)
      }
    } catch (err) {
      // Skip individual slides that fail to parse
      console.error(`Failed to parse ${slideFile}:`, err)
    }
  }

  if (texts.length === 0) {
    throw new Error(
      "No text content found in any slides. The slides may contain only images."
    )
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
