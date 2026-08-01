import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureUserWorkspace } from "@/server/auth/defaults"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { profileUpdateSchema, validationError } from "@/server/validation/api"

// GET /api/profile — current user profile + email settings + security settings
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  await ensureUserWorkspace(auth.user)
  const profile = await db.profile.findUniqueOrThrow({ where: { userId: auth.user.id } })
  return NextResponse.json({
    profile: {
      ...profile,
    },
  })
}

// PATCH /api/profile — update profile + email settings + security settings
export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const parsed = profileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const data = parsed.data

  const profile = await db.profile.upsert({
    where: { userId: auth.user.id },
    create: {
      userId: auth.user.id,
      email: auth.user.email,
      name: data.name || auth.user.name || "Memex User",
      ...data,
    },
    update: data,
  })

  return NextResponse.json({ profile })
}
