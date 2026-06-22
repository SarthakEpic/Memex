import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/notes/export-all
// Exports all notes as a single concatenated Markdown document.
// Each note is separated by a horizontal rule with a header containing
// title, source path, project, tags, and dates.
export async function GET() {
  const notes = await db.note.findMany({
    orderBy: [{ pinned: "desc" }, { title: "asc" }],
  })

  if (notes.length === 0) {
    return NextResponse.json({ error: "No notes to export" }, { status: 404 })
  }

  const sections: string[] = []
  sections.push(`# Memex Notes Export`)
  sections.push("")
  sections.push(`_Exported ${new Date().toISOString()}_`)
  sections.push(`_${notes.length} notes · ${notes.reduce((s, n) => s + n.chunkCount, 0)} chunks total_`)
  sections.push("")
  sections.push("---")
  sections.push("")

  for (const note of notes) {
    const tags = note.tags ? note.tags.split(",").filter(Boolean) : []
    sections.push(`## ${note.title}${note.pinned ? " 📌" : ""}`)
    sections.push("")
    sections.push(`> **Source:** \`${note.sourcePath}\``)
    sections.push(`> **Project:** ${note.project}`)
    if (tags.length > 0) sections.push(`> **Tags:** ${tags.join(", ")}`)
    sections.push(`> **Chunks:** ${note.chunkCount}`)
    sections.push(`> **Created:** ${note.createdAt.toISOString().slice(0, 10)}`)
    sections.push(`> **Updated:** ${note.updatedAt.toISOString().slice(0, 10)}`)
    sections.push("")
    sections.push(note.content)
    sections.push("")
    sections.push("---")
    sections.push("")
  }

  const markdown = sections.join("\n")
  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="memex-notes-${stamp}.md"`,
    },
  })
}
