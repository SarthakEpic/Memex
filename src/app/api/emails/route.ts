import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createEmail, executeSend, verifyEmail } from "@/lib/email"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import {
  createEmailSchema,
  patchEmailSchema,
  validationError,
} from "@/server/validation/api"

// GET /api/emails?status=X&sourceType=Y
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const status = req.nextUrl.searchParams.get("status")
  const sourceType = req.nextUrl.searchParams.get("sourceType")
  const where: { userId: string; status?: string; sourceType?: string } = { userId: auth.user.id }
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
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, { name: "emails:create", limit: 60, windowMs: 60_000, userId: auth.user.id })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = createEmailSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
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
  } = parsed.data

  // Resolve "me" profile if toAddress is "me" or empty
  let recipient = toAddress
  if (toAddress === "me" || !toAddress) {
    const profile = await db.profile.findUnique({ where: { userId: auth.user.id } })
    recipient = profile?.email || "you@memex.local"
  }

  const result = await createEmail({
    userId: auth.user.id,
    toAddress: recipient,
    subject,
    bodyMarkdown,
    sourceType: sourceType || "manual",
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
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, { name: "emails:patch", limit: 80, windowMs: 60_000, userId: auth.user.id })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = patchEmailSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { action, id, subject, bodyMarkdown, toAddress } = parsed.data

  switch (action) {
    case "verify": {
      // Human verification completed — send the email
      const result = await verifyEmail(id, auth.user.id)
      return NextResponse.json(result)
    }
    case "resend": {
      // Retry sending a failed email
      const email = await db.email.findFirst({ where: { id, userId: auth.user.id } })
      if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (email.status === "delivered") {
        return NextResponse.json({ error: "Email already delivered" }, { status: 400 })
      }
      const result = await executeSend(id, auth.user.id)
      return NextResponse.json(result)
    }
    case "cancel": {
      // Cancel a pending/scheduled email
      await db.email.updateMany({
        where: { id, userId: auth.user.id },
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
      await db.email.updateMany({ where: { id, userId: auth.user.id }, data })
      const email = await db.email.findFirstOrThrow({ where: { id, userId: auth.user.id } })
      return NextResponse.json({ email })
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
