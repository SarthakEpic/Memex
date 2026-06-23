import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createEmail, executeSend, verifyEmail } from "@/lib/email"

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
    emails: emails.map((e) => ({ ...e })),
  })
}

// POST /api/emails — create email (draft, pending verification, or send immediately)
// Body: { toAddress, subject, bodyMarkdown, sourceType?, sourceId?, fromName?, scheduledFor?, isAiGenerated?, requireVerification? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    toAddress,
    subject,
    bodyMarkdown,
    sourceType,
    sourceId,
    fromName,
    scheduledFor,
    isAiGenerated,
    requireVerification,
  } = body as {
    toAddress?: string
    subject?: string
    bodyMarkdown?: string
    sourceType?: string
    sourceId?: string
    fromName?: string
    scheduledFor?: string | null
    isAiGenerated?: boolean
    requireVerification?: boolean
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

  const result = await createEmail({
    toAddress: recipient,
    subject,
    bodyMarkdown,
    sourceType: (sourceType as any) || "manual",
    sourceId: sourceId || "",
    fromName: fromName || "Memex",
    scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    isAiGenerated: isAiGenerated ?? false,
    requireVerification: requireVerification ?? false,
  })

  return NextResponse.json(result)
}

// PATCH /api/emails — verify, resend, cancel, or update an email
// Body: { action: "verify" | "resend" | "cancel" | "edit", id, ...fields }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action, id, subject, bodyMarkdown, toAddress } = body as {
    action?: string
    id?: string
    subject?: string
    bodyMarkdown?: string
    toAddress?: string
  }

  if (!action || !id) {
    return NextResponse.json({ error: "action and id are required" }, { status: 400 })
  }

  switch (action) {
    case "verify": {
      // Human verification completed — send the email
      const result = await verifyEmail(id)
      return NextResponse.json(result)
    }
    case "resend": {
      // Retry sending a failed email
      const email = await db.email.findUnique({ where: { id } })
      if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (email.status === "delivered") {
        return NextResponse.json({ error: "Email already delivered" }, { status: 400 })
      }
      const result = await executeSend(id)
      return NextResponse.json(result)
    }
    case "cancel": {
      // Cancel a pending/scheduled email
      await db.email.update({
        where: { id },
        data: { status: "cancelled" },
      })
      return NextResponse.json({ ok: true, status: "cancelled" })
    }
    case "edit": {
      // Edit a draft or pending email
      const data: any = {}
      if (subject !== undefined) data.subject = subject
      if (bodyMarkdown !== undefined) {
        data.bodyMarkdown = bodyMarkdown
        // Re-render HTML
        const { markdownToHtml } = await import("@/lib/markdown")
        data.bodyHtml = await markdownToHtml(bodyMarkdown)
      }
      if (toAddress !== undefined) data.toAddress = toAddress
      const email = await db.email.update({ where: { id }, data })
      return NextResponse.json({ email })
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
