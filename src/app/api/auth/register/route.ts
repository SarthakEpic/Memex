import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPassword } from "@/server/auth/password"
import { ensureUserWorkspace } from "@/server/auth/defaults"
import { rejectInvalidOrigin } from "@/server/auth/guard"
import { attachSessionCookie, createUserSession } from "@/server/auth/session"
import { getAppBaseUrl, isSystemMailerConfigured, sendSystemEmail } from "@/server/auth/system-mail"
import { createEmailVerificationToken } from "@/server/auth/tokens"
import { rateLimit } from "@/server/security/rate-limit"
import { registerSchema, validationError } from "@/server/validation/api"

export async function POST(req: NextRequest) {
  const invalidOrigin = rejectInvalidOrigin(req)
  if (invalidOrigin) return invalidOrigin

  const limited = await rateLimit(req, {
    name: "auth:register",
    limit: 5,
    windowMs: 60_000,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const { email, name, password } = parsed.data
  const requiresEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true"
  if (requiresEmailVerification && process.env.NODE_ENV === "production" && !isSystemMailerConfigured()) {
    return NextResponse.json(
      { error: "Email verification is required, but platform SMTP is not configured." },
      { status: 503 }
    )
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 })
  }

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
    },
  })
  await ensureUserWorkspace(user)

  const verification = await createEmailVerificationToken(user)
  const verificationUrl = `${getAppBaseUrl(req)}/api/auth/verify-email?token=${verification.token}`
  const verificationDelivery = await sendSystemEmail({
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

  if (requiresEmailVerification) {
    return NextResponse.json(
      {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        requiresEmailVerification: true,
        emailVerificationSent: verificationDelivery.sent,
        verificationUrl: process.env.NODE_ENV === "production" ? undefined : verificationUrl,
      },
      { status: 201 }
    )
  }

  const session = await createUserSession(user.id)
  return attachSessionCookie(
    NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      emailVerificationSent: verificationDelivery.sent,
      verificationUrl: process.env.NODE_ENV === "production" ? undefined : verificationUrl,
    }),
    session.token,
    session.expiresAt
  )
}
