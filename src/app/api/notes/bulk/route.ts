import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateCorpusCache } from "@/lib/retrieval"

// GET /api/notes/bulk?action=export&ids=id1,id2,id3
// Export selected notes as a single Markdown document
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action")
  const idsParam = req.nextUrl.searchParams.get("ids")

  if (action === "export" && idsParam) {
    const ids = idsParam.split(",")
    const notes = await db.note.findMany({
      where: { id: { in: ids } },
      orderBy: [{ pinned: "desc" }, { title: "asc" }],
    })
    const sections: string[] = ["# Memex Notes Export (Selected)\n"]
    for (const note of notes) {
      sections.push(`## ${note.title}${note.pinned ? " 📌" : ""}\n`)
      sections.push(`> Source: \`${note.sourcePath}\` | Project: ${note.project}`)
      sections.push(`\n${note.content}\n\n---\n`)
    }
    const markdown = sections.join("\n")
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="memex-selected-${new Date().toISOString().slice(0, 10)}.md"`,
      },
    })
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 })
}

// POST /api/notes/bulk
// Body: { action: "delete" | "pin" | "unpin" | "export", ids: string[] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action, ids } = body as { action?: string; ids?: string[] }

  if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "action and ids[] are required" }, { status: 400 })
  }

  switch (action) {
    case "delete": {
      // Delete notes and all related data
      await db.decision.deleteMany({ where: { noteId: { in: ids } } })
      await db.chunk.deleteMany({ where: { noteId: { in: ids } } })
      await db.note.deleteMany({ where: { id: { in: ids } } })
      invalidateCorpusCache()
      return NextResponse.json({ ok: true, deleted: ids.length })
    }
    case "pin": {
      await db.note.updateMany({ where: { id: { in: ids } }, data: { pinned: true } })
      return NextResponse.json({ ok: true, pinned: ids.length })
    }
    case "unpin": {
      await db.note.updateMany({ where: { id: { in: ids } }, data: { pinned: false } })
      return NextResponse.json({ ok: true, unpinned: ids.length })
    }
    case "export": {
      const notes = await db.note.findMany({
        where: { id: { in: ids } },
        orderBy: [{ pinned: "desc" }, { title: "asc" }],
      })
      const sections: string[] = ["# Memex Notes Export (Selected)\n"]
      for (const note of notes) {
        sections.push(`## ${note.title}${note.pinned ? " 📌" : ""}\n`)
        sections.push(`> Source: \`${note.sourcePath}\` | Project: ${note.project}`)
        sections.push(`\n${note.content}\n\n---\n`)
      }
      const markdown = sections.join("\n")
      return new NextResponse(markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="memex-selected-${new Date().toISOString().slice(0, 10)}.md"`,
        },
      })
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
