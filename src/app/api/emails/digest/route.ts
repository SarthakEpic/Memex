import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { buildDigestBody, sendEmail } from "@/lib/email"

// POST /api/emails/digest
// Triggers a daily digest email to the profile's address.
// Body: { force?: boolean } — if true, send even if no content
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { force = false } = body as { force?: boolean }

  const profile = await db.profile.findUnique({ where: { id: "me" } })
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 400 })

  const { subject, bodyMarkdown, hasContent } = await buildDigestBody()
  if (!hasContent && !force) {
    return NextResponse.json({ skipped: true, message: "No new activity in last 24h." })
  }

  const result = await sendEmail({
    toAddress: profile.email,
    subject,
    bodyMarkdown,
    sourceType: "digest",
    fromName: "Memex Digest",
  })

  return NextResponse.json({ ...result, subject })
}
