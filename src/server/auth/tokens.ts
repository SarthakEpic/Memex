import { createHash, randomBytes } from "node:crypto"
import { db } from "@/lib/db"

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

export function authTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function newToken(): string {
  return randomBytes(32).toString("base64url")
}

export async function createEmailVerificationToken(user: {
  id: string
  email: string
}): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)

  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      email: user.email,
      tokenHash: authTokenHash(token),
      expiresAt,
    },
  })

  return { token, expiresAt }
}

export async function consumeEmailVerificationToken(token: string): Promise<{
  ok: boolean
  userId?: string
  email?: string
  reason?: "invalid" | "expired" | "used"
}> {
  const now = new Date()
  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash: authTokenHash(token) },
  })

  if (!record) return { ok: false, reason: "invalid" }
  if (record.consumedAt) return { ok: false, reason: "used" }
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" }
  }

  const consumed = await db.emailVerificationToken.updateMany({
    where: {
      id: record.id,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  })
  if (consumed.count !== 1) return { ok: false, reason: "used" }

  await db.user.update({
    where: { id: record.userId },
    data: { emailVerifiedAt: now },
  })

  return { ok: true, userId: record.userId, email: record.email }
}

export async function createPasswordResetToken(userId: string): Promise<{
  token: string
  expiresAt: Date
}> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)

  await db.passwordResetToken.create({
    data: {
      userId,
      tokenHash: authTokenHash(token),
      expiresAt,
    },
  })

  return { token, expiresAt }
}

export async function consumePasswordResetToken(token: string): Promise<{
  ok: boolean
  userId?: string
  reason?: "invalid" | "expired" | "used"
}> {
  const now = new Date()
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: authTokenHash(token) },
  })

  if (!record) return { ok: false, reason: "invalid" }
  if (record.consumedAt) return { ok: false, reason: "used" }
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" }
  }

  const consumed = await db.passwordResetToken.updateMany({
    where: {
      id: record.id,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  })
  if (consumed.count !== 1) return { ok: false, reason: "used" }

  return { ok: true, userId: record.userId }
}

export async function deleteExpiredAuthTokens(): Promise<number> {
  const now = new Date()
  const [verification, reset] = await Promise.all([
    db.emailVerificationToken.deleteMany({
      where: { expiresAt: { lte: now } },
    }),
    db.passwordResetToken.deleteMany({
      where: { expiresAt: { lte: now } },
    }),
  ])
  return verification.count + reset.count
}
