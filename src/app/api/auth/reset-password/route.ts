import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rejectInvalidOrigin } from "@/server/auth/guard"
import { hashPassword } from "@/server/auth/password"
import { consumePasswordResetToken } from "@/server/auth/tokens"
import { rateLimit } from "@/server/security/rate-limit"
import { resetPasswordSchema, validationError } from "@/server/validation/api"

export async function POST(req: NextRequest) {
  const invalidOrigin = rejectInvalidOrigin(req)
  if (invalidOrigin) return invalidOrigin

  const limited = await rateLimit(req, {
    name: "auth:reset-password",
    limit: 8,
    windowMs: 60_000,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const consumed = await consumePasswordResetToken(parsed.data.token)
  if (!consumed.ok || !consumed.userId) {
    return NextResponse.json(
      { error: "This reset link is invalid or expired." },
      { status: 400 }
    )
  }

  await db.$transaction([
    db.user.update({
      where: { id: consumed.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    db.authSession.deleteMany({ where: { userId: consumed.userId } }),
  ])

  return NextResponse.json({ ok: true })
}
