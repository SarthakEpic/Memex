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
import { extractDecisions } from "@/lib/llm"

let zaiPromise: Promise<ZAI> | null = null
function getClient(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create()
  return zaiPromise
}

// Convert HTML to Markdown (lightweight — handles common tags)
function htmlToMarkdown(html: string): string {
  return html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n\n")
    // Bold + italic
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    // Links
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    // Code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```\n\n")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    // Blockquotes
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, c) =>
      "> " + c.replace(/<[^>]*>/g, "").split("\n").join("\n> ") + "\n\n")
    // Lists
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    // Paragraphs + line breaks
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse whitespace
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

// POST /api/notes/import-url
// Body: { url: string, project?: string, tags?: string[] }
// Fetches the URL via the page_reader function, converts HTML → Markdown,
// and ingests it as a note (chunk + extract decisions).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { url, project, tags, extractDecisions: doExtract = true } = body as {
    url?: string
    project?: string
    tags?: string[]
    extractDecisions?: boolean
  }

  if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "A valid http(s) URL is required" }, { status: 400 })
  }

  let pageData: { title: string; html: string; publishedTime?: string; url: string }
  try {
    const zai = await getClient()
    const result = await zai.functions.invoke("page_reader", { url })
    if (!result?.data?.html) {
      return NextResponse.json(
        { error: "Could not extract content from that URL." },
        { status: 422 }
      )
    }
    pageData = {
      title: result.data.title || url,
      html: result.data.html,
      publishedTime: result.data.publishedTime,
      url: result.data.url,
    }
  } catch (err: any) {
    const msg = err?.message || "Unknown error"
    if (msg.includes("429") || msg.toLowerCase().includes("too many")) {
      return NextResponse.json(
        { error: "The content extraction service is rate-limited. Please try again in a moment." },
        { status: 429 }
      )
    }
    return NextResponse.json(
      { error: `Failed to fetch URL: ${msg}` },
      { status: 502 }
    )
  }

  // Convert HTML → Markdown
  const markdownBody = htmlToMarkdown(pageData.html)
  if (markdownBody.length < 50) {
    return NextResponse.json(
      { error: "The page content was too short to ingest." },
      { status: 422 }
    )
  }

  // Add a header with the source URL
  const title = pageData.title.slice(0, 120)
  const sourceUrl = pageData.url
  const publishedAt = pageData.publishedTime || ""
  const content = `# ${title}

_Source: [${sourceUrl}](${sourceUrl})${publishedAt ? ` · Published ${publishedAt.slice(0, 10)}` : ""}_

${markdownBody}`

  const sourcePath = `/notes/url/${new URL(sourceUrl).hostname}/${slugify(title)}.md`
  const hash = await contentHash(content)

  // Upsert — re-chunk if content changed
  const existing = await db.note.findUnique({ where: { sourcePath } })
  if (existing && existing.contentHash === hash) {
    return NextResponse.json({
      id: existing.id,
      title: existing.title,
      sourcePath: existing.sourcePath,
      chunkCount: existing.chunkCount,
      skipped: true,
      message: "Note unchanged (content hash match).",
    })
  }
  if (existing) {
    await db.decision.deleteMany({ where: { noteId: existing.id } })
    await db.chunk.deleteMany({ where: { noteId: existing.id } })
  }

  const note = await db.note.upsert({
    where: { sourcePath },
    create: {
      title,
      content,
      sourcePath,
      project: project || "web",
      tags: [...(tags || []), "url-import"].join(","),
      contentHash: hash,
    },
    update: {
      title,
      content,
      project: project || "web",
      tags: [...(tags || []), "url-import"].join(","),
      contentHash: hash,
      updatedAt: new Date(),
    },
  })

  const chunks = chunkMarkdown(content, title)
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
    title: note.title,
    sourcePath: note.sourcePath,
    sourceUrl,
    chunkCount: chunks.length,
    decisionsExtracted,
    message: `Imported "${title}" → ${chunks.length} chunks${
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
