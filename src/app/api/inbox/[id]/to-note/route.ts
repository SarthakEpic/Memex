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

// POST /api/inbox/[id]/to-note
// Converts an inbox email into a searchable note.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const email = await db.inboxEmail.findUnique({ where: { id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Convert email to Markdown note format
  const title = `Email: ${email.subject}`
  const content = `# ${email.subject}

> **From:** ${email.fromName || email.fromAddress} <${email.fromAddress}>
> **Date:** ${new Date(email.receivedAt).toLocaleString()}
> **Category:** ${email.category}

${email.body}

---
_Converted from inbox email by Memex_`

  const sourcePath = `/notes/email/${slugify(email.subject)}.md`
  const hash = await contentHash(content)

  // Check for existing
  const existing = await db.note.findUnique({ where: { sourcePath } })
  if (existing && existing.contentHash === hash) {
    return NextResponse.json({
      id: existing.id,
      title: existing.title,
      skipped: true,
      message: "This email is already a note.",
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
      project: "email",
      tags: "email," + email.category,
      contentHash: hash,
    },
    update: {
      title,
      content,
      project: "email",
      tags: "email," + email.category,
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
            project: "email",
            confidence: d.confidence ?? 0.8,
          },
        })
        decisionsExtracted++
      }
    } catch {
      // best-effort
    }
  }

  await db.note.update({
    where: { id: note.id },
    data: { chunkCount: chunks.length },
  })

  invalidateCorpusCache()

  return NextResponse.json({
    id: note.id,
    title,
    sourcePath,
    chunkCount: chunks.length,
    decisionsExtracted,
    message: `Email converted to note → ${chunks.length} chunks${decisionsExtracted > 0 ? `, ${decisionsExtracted} decisions` : ""}.`,
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
