import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateCorpusCache } from "@/lib/retrieval"
import { ensureUserWorkspace } from "@/server/auth/defaults"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { eraseWorkspaceSchema } from "@/server/validation/mutations"

// POST /api/security/erase
// Erases the signed-in user's workspace data from the database. This is irreversible.
// Body: { confirm: string } — must be "ERASE ALL DATA" to proceed
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const parsed = eraseWorkspaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }

  const userId = auth.user.id

  // Delete only this user's workspace data in dependency order.
  await db.inboxEmail.deleteMany({ where: { userId } })
  await db.emailAccount.deleteMany({ where: { userId } })
  await db.email.deleteMany({ where: { userId } })
  await db.emailTemplate.deleteMany({ where: { userId } })
  await db.chatMessage.deleteMany({ where: { userId } })
  await db.chatSession.deleteMany({ where: { userId } })
  await db.decision.deleteMany({ where: { userId } })
  await db.chunk.deleteMany({ where: { userId } })
  await db.note.deleteMany({ where: { userId } })
  await db.profile.deleteMany({ where: { userId } })

  await ensureUserWorkspace(auth.user)
  invalidateCorpusCache(userId)

  return NextResponse.json({
    ok: true,
    message: "Your Memex workspace has been erased and reset.",
  })
}
