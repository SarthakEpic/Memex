import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rejectInvalidOrigin } from "@/server/auth/guard"
import { getAppBaseUrl, sendSystemEmail } from "@/server/auth/system-mail"
import { createPasswordResetToken } from "@/server/auth/tokens"
import { rateLimit } from "@/server/security/rate-limit"
import { requestPasswordResetSchema, validationError } from "@/server/validation/api"

export async function POST(req: NextRequest) {
  const invalidOrigin = rejectInvalidOrigin(req)
  if (invalidOrigin) return invalidOrigin

  const limited = await rateLimit(req, {
    name: "auth:request-password-reset",
    limit: 5,
    windowMs: 60_000,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = requestPasswordResetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } })
  let resetUrl: string | undefined

  if (user) {
    const reset = await createPasswordResetToken(user.id)
    resetUrl = `${getAppBaseUrl(req)}/reset-password?token=${reset.token}`
    await sendSystemEmail({
      to: user.email,
      subject: "Reset your Memex password",
      bodyMarkdown: [
        "# Reset your Memex password",
        "",
        "Use this link to choose a new password:",
        "",
        resetUrl,
        "",
        "This link expires in 1 hour. If you did not request it, ignore this email.",
      ].join("\n"),
    })
  }

  return NextResponse.json({
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
    resetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl,
  })
}
