import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"

// GET /api/emails?status=X&sourceType=Y
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status")
  const sourceType = req.nextUrl.searchParams.get("sourceType")
  const where: { status?: string; sourceType?: string } = {}
  if (status) where.status = status
  if (sourceType) where.sourceType = sourceType

  const emails = await db.email.findMany({
    where,
    orderBy: { queuedAt: "desc" },
    take: 200,
  })
  return NextResponse.json({
    emails: emails.map((e) => ({
      ...e,
    })),
  })
}

// POST /api/emails — send (queue + deliver) an email
// Body: { toAddress, subject, bodyMarkdown, sourceType?, sourceId?, fromName?, scheduledFor? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { toAddress, subject, bodyMarkdown, sourceType, sourceId, fromName, scheduledFor } = body as {
    toAddress?: string
    subject?: string
    bodyMarkdown?: string
    sourceType?: string
    sourceId?: string
    fromName?: string
    scheduledFor?: string | null
  }

  if (!toAddress || !subject || !bodyMarkdown) {
    return NextResponse.json(
      { error: "toAddress, subject, bodyMarkdown are required" },
      { status: 400 }
    )
  }

  // Resolve "me" profile if toAddress is "me" or empty
  let recipient = toAddress
  if (toAddress === "me" || !toAddress) {
    const profile = await db.profile.findUnique({ where: { id: "me" } })
    recipient = profile?.email || "you@memex.local"
  }

  const result = await sendEmail({
    toAddress: recipient,
    subject,
    bodyMarkdown,
    sourceType: (sourceType as any) || "manual",
    sourceId: sourceId || "",
    fromName: fromName || "Memex",
    scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
  })

  return NextResponse.json(result)
}
