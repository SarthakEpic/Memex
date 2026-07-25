import { NextRequest, NextResponse } from "next/server"
import { ingestNote } from "@/server/services/ingestion"
import { slugify } from "@/server/services/ingestion-utils"
import { fetchPublicWebPageContent } from "@/server/services/web-page"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import { importUrlSchema, validationError } from "@/server/validation/api"

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
// Fetches the URL directly (no AI provider needed — just HTTP fetch + HTML parsing),
// converts HTML → Markdown, and ingests it as a note (chunk + extract decisions).
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, { name: "notes:import-url", limit: 30, windowMs: 60_000, userId: auth.user.id })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = importUrlSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  // Fetch through a redirect-aware public URL guard to prevent SSRF.
  const pageResult = await fetchPublicWebPageContent(parsed.data.url)

  if (!pageResult.ok) {
    const msg = pageResult.error || "Unknown error"
    if (msg.includes("429") || msg.toLowerCase().includes("too many")) {
      return NextResponse.json(
        { error: "The target website is rate-limiting requests. Please try again in a moment." },
        { status: 429 }
      )
    }
    return NextResponse.json(
      { error: `Failed to fetch URL: ${msg}` },
      { status: 502 }
    )
  }

  if (!pageResult.html) {
    return NextResponse.json(
      { error: "Could not extract content from that URL." },
      { status: 422 }
    )
  }

  // Convert HTML → Markdown
  const markdownBody = htmlToMarkdown(pageResult.html)
  if (markdownBody.length < 50) {
    return NextResponse.json(
      { error: "The page content was too short to ingest." },
      { status: 422 }
    )
  }

  // Add a header with the source URL
  const title = pageResult.title.slice(0, 120)
  const sourceUrl = pageResult.url
  const publishedAt = pageResult.publishedTime || ""
  const content = `# ${title}

_Source: [${sourceUrl}](${sourceUrl})${publishedAt ? ` · Published ${publishedAt.slice(0, 10)}` : ""}_

${markdownBody}`

  const sourcePath = `/notes/url/${new URL(sourceUrl).hostname}/${slugify(title)}.md`
  const result = await ingestNote({
    userId: auth.user.id,
    title,
    content,
    sourcePath,
    project: parsed.data.project || "web",
    tags: [...(parsed.data.tags || []), "url-import"],
    extractDecisions: parsed.data.extractDecisions,
  })

  return NextResponse.json({
    id: result.id,
    title: result.title,
    sourcePath: result.sourcePath,
    sourceUrl,
    chunkCount: result.chunkCount,
    decisionsExtracted: result.decisionsExtracted,
    skipped: result.skipped,
    message: result.skipped
      ? "Note unchanged (content hash match)."
      : `Imported "${title}" → ${result.chunkCount} chunks${
          result.decisionsExtracted > 0 ? `, ${result.decisionsExtracted} decisions` : ""
        }.`,
  })
}
