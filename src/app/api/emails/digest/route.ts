import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { buildDigestBody, sendEmail, processScheduledEmails } from "@/lib/email"

// POST /api/emails/digest
// Triggers a daily digest email to the profile's address.
// Also processes any scheduled emails that are due (acts as the scheduler tick).
// Body: { force?: boolean } — if true, send even if no content
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { force = false } = body as { force?: boolean }

  // Process any scheduled emails that are due
  const delivered = await processScheduledEmails()

  const profile = await db.profile.findUnique({ where: { id: "me" } })
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 400 })

  const { subject, bodyMarkdown, hasContent } = await buildDigestBody()
  if (!hasContent && !force) {
    return NextResponse.json({
      skipped: true,
      message: "No new activity in last 24h.",
      scheduledDelivered: delivered,
    })
  }

  const result = await sendEmail({
    toAddress: profile.email,
    subject,
    bodyMarkdown,
    sourceType: "digest",
    fromName: "Memex Digest",
  })

  return NextResponse.json({ ...result, subject, scheduledDelivered: delivered })
}

