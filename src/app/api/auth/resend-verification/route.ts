import { NextRequest, NextResponse } from "next/server"
import { isAuthFailure, rejectInvalidOrigin, requireUser } from "@/server/auth/guard"
import { getAppBaseUrl, sendSystemEmail } from "@/server/auth/system-mail"
import { createEmailVerificationToken } from "@/server/auth/tokens"
import { rateLimit } from "@/server/security/rate-limit"

export async function POST(req: NextRequest) {
  const invalidOrigin = rejectInvalidOrigin(req)
  if (invalidOrigin) return invalidOrigin

  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, {
    name: "auth:resend-verification",
    limit: 3,
    windowMs: 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  const verification = await createEmailVerificationToken(auth.user)
  const verificationUrl = `${getAppBaseUrl(req)}/api/auth/verify-email?token=${verification.token}`
  await sendSystemEmail({
    to: auth.user.email,
    subject: "Verify your Memex account",
    bodyMarkdown: [
      "# Verify your Memex account",
      "",
      "Confirm this email address to finish securing your Memex account:",
      "",
      verificationUrl,
      "",
      "This link expires in 24 hours.",
    ].join("\n"),
  })

  return NextResponse.json({
    ok: true,
    verificationUrl: process.env.NODE_ENV === "production" ? undefined : verificationUrl,
  })
}
