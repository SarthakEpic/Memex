import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { noteBulkMutationSchema } from "@/server/validation/mutations"

// GET /api/notes/bulk?action=export&ids=id1,id2,id3
// Export selected notes as a single Markdown document
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const action = req.nextUrl.searchParams.get("action")
  const idsParam = req.nextUrl.searchParams.get("ids")

  if (action === "export" && idsParam) {
    const ids = idsParam.split(",")
    const notes = await db.note.findMany({
      where: { id: { in: ids }, userId: auth.user.id },
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
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const parsed = noteBulkMutationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { action, ids } = parsed.data

  switch (action) {
    case "delete": {
      // Delete notes and all related data
      await db.decision.deleteMany({ where: { noteId: { in: ids }, userId: auth.user.id } })
      await db.chunk.deleteMany({ where: { noteId: { in: ids }, userId: auth.user.id } })
      await db.note.deleteMany({ where: { id: { in: ids }, userId: auth.user.id } })
      invalidateCorpusCache(auth.user.id)
      return NextResponse.json({ ok: true, deleted: ids.length })
    }
    case "pin": {
      await db.note.updateMany({ where: { id: { in: ids }, userId: auth.user.id }, data: { pinned: true } })
      return NextResponse.json({ ok: true, pinned: ids.length })
    }
    case "unpin": {
      await db.note.updateMany({ where: { id: { in: ids }, userId: auth.user.id }, data: { pinned: false } })
      return NextResponse.json({ ok: true, unpinned: ids.length })
    }
    case "export": {
      const notes = await db.note.findMany({
        where: { id: { in: ids }, userId: auth.user.id },
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
