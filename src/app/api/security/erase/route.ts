import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateCorpusCache } from "@/lib/retrieval"

// POST /api/security/erase
// Erases ALL user data from the database. This is irreversible.
// Body: { confirm: string } — must be "ERASE ALL DATA" to proceed
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { confirm } = body as { confirm?: string }

  if (confirm !== "ERASE ALL DATA") {
    return NextResponse.json(
      { error: "Confirmation string does not match. Type 'ERASE ALL DATA' to confirm." },
      { status: 400 }
    )
  }

  // Delete all user data in order (respecting foreign keys)
  await db.inboxEmail.deleteMany()
  await db.emailAccount.deleteMany()
  await db.email.deleteMany()
  await db.emailTemplate.deleteMany()
  await db.chatMessage.deleteMany()
  await db.chatSession.deleteMany()
  await db.decision.deleteMany()
  await db.chunk.deleteMany()
  await db.note.deleteMany()

  // Reset profile to defaults (but keep the profile record)
  await db.profile.update({
    where: { id: "me" },
    data: {
      email: "you@memex.local",
      name: "Memex User",
      smtpHost: "smtp.memex.local",
      smtpPort: 587,
      smtpUser: "",
      dailyDigest: true,
      digestHour: 9,
      dataEncryption: true,
      llmPrivacyMode: true,
      autoDeleteDays: 0,
    },
  })

  invalidateCorpusCache()

  return NextResponse.json({
    ok: true,
    message: "All data has been erased. The database is now empty.",
  })
}
