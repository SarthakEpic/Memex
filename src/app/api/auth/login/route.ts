import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureUserWorkspace } from "@/server/auth/defaults"
import { rejectInvalidOrigin } from "@/server/auth/guard"
import { verifyPassword } from "@/server/auth/password"
import { attachSessionCookie, createUserSession } from "@/server/auth/session"
import { getAppBaseUrl, isSystemMailerConfigured, sendSystemEmail } from "@/server/auth/system-mail"
import { createEmailVerificationToken } from "@/server/auth/tokens"
import { rateLimit } from "@/server/security/rate-limit"
import { loginSchema, validationError } from "@/server/validation/api"

export async function POST(req: NextRequest) {
  const invalidOrigin = rejectInvalidOrigin(req)
  if (invalidOrigin) return invalidOrigin

  const limited = await rateLimit(req, {
    name: "auth:login",
    limit: 10,
    windowMs: 60_000,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const { email, password } = parsed.data
  const user = await db.user.findUnique({ where: { email } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 })
  }
  if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerifiedAt) {
    if (process.env.NODE_ENV === "production" && !isSystemMailerConfigured()) {
      return NextResponse.json(
        { error: "Email verification is required, but platform SMTP is not configured." },
        { status: 503 }
      )
    }

    const verification = await createEmailVerificationToken(user)
    const verificationUrl = `${getAppBaseUrl(req)}/api/auth/verify-email?token=${verification.token}`
    const delivery = await sendSystemEmail({
      to: user.email,
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

    return NextResponse.json(
      {
        error: "Please verify your email before signing in. We sent a fresh verification link.",
        code: "email_unverified",
        requiresEmailVerification: true,
        emailVerificationSent: delivery.sent,
        verificationUrl: process.env.NODE_ENV === "production" ? undefined : verificationUrl,
      },
      { status: 403 }
    )
  }

  await ensureUserWorkspace(user)
  const session = await createUserSession(user.id)
  return attachSessionCookie(
    NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }),
    session.token,
    session.expiresAt
  )
}
