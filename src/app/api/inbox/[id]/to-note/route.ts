import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ingestNote } from "@/server/services/ingestion"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// POST /api/inbox/[id]/to-note
// Converts an inbox email into a searchable note.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const email = await db.inboxEmail.findFirst({ where: { id, userId: auth.user.id } })
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
  const result = await ingestNote({
    userId: auth.user.id,
    title,
    content,
    sourcePath,
    project: "email",
    tags: ["email", email.category],
    extractDecisions: true,
  })

  return NextResponse.json({
    id: result.id,
    title,
    sourcePath,
    chunkCount: result.chunkCount,
    decisionsExtracted: result.decisionsExtracted,
    skipped: result.skipped,
    message: result.skipped
      ? "This email is already a note."
      : `Email converted to note → ${result.chunkCount} chunks${result.decisionsExtracted > 0 ? `, ${result.decisionsExtracted} decisions` : ""}.`,
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
