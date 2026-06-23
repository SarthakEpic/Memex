import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/notes/search?q=text
// Full-text search across note titles, content, and tags.
// Returns matching notes with highlighted snippets.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q) return NextResponse.json({ results: [] })

  const lower = q.toLowerCase()
  const notes = await db.note.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { content: { contains: q } },
        { tags: { contains: q } },
        { sourcePath: { contains: q } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  })

  const results = notes.map((n) => {
    // Find the best snippet position in content
    const contentLower = n.content.toLowerCase()
    const idx = contentLower.indexOf(lower)
    let snippet = ""
    if (idx !== -1) {
      const start = Math.max(0, idx - 60)
      const end = Math.min(n.content.length, idx + q.length + 120)
      snippet = (start > 0 ? "…" : "") + n.content.slice(start, end) + (end < n.content.length ? "…" : "")
    }
    return {
      id: n.id,
      title: n.title,
      sourcePath: n.sourcePath,
      project: n.project,
      tags: n.tags ? n.tags.split(",") : [],
      snippet,
      matchIn: (idx !== -1 ? "content" : n.title.toLowerCase().includes(lower) ? "title" : "tags") as "content" | "title" | "tags",
      updatedAt: n.updatedAt,
    }
  })

  return NextResponse.json({ results, query: q })
}
