import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/profile — current user profile + email settings + security settings
export async function GET() {
  let profile = await db.profile.findUnique({ where: { id: "me" } })
  if (!profile) {
    profile = await db.profile.create({
      data: { id: "me", email: "you@memex.local", name: "Memex User" },
    })
  }
  return NextResponse.json({
    profile: {
      ...profile,
    },
  })
}

// PATCH /api/profile — update profile + email settings + security settings
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    email,
    name,
    smtpHost,
    smtpPort,
    smtpUser,
    dailyDigest,
    digestHour,
    dataEncryption,
    llmPrivacyMode,
    autoDeleteDays,
  } = body as {
    email?: string
    name?: string
    smtpHost?: string
    smtpPort?: number
    smtpUser?: string
    dailyDigest?: boolean
    digestHour?: number
    dataEncryption?: boolean
    llmPrivacyMode?: boolean
    autoDeleteDays?: number
  }

  const data: any = {}
  if (email !== undefined) data.email = email
  if (name !== undefined) data.name = name
  if (smtpHost !== undefined) data.smtpHost = smtpHost
  if (smtpPort !== undefined) data.smtpPort = smtpPort
  if (smtpUser !== undefined) data.smtpUser = smtpUser
  if (dailyDigest !== undefined) data.dailyDigest = dailyDigest
  if (digestHour !== undefined) data.digestHour = digestHour
  if (dataEncryption !== undefined) data.dataEncryption = dataEncryption
  if (llmPrivacyMode !== undefined) data.llmPrivacyMode = llmPrivacyMode
  if (autoDeleteDays !== undefined) data.autoDeleteDays = autoDeleteDays

  const profile = await db.profile.upsert({
    where: { id: "me" },
    create: { id: "me", ...data },
    update: data,
  })

  return NextResponse.json({ profile })
}
