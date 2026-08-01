import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { draftEmailReply } from "@/lib/llm"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { inboxReplySchema } from "@/server/validation/mutations"
import { rateLimit } from "@/server/security/rate-limit"

// POST /api/inbox/[id]/reply
// Body: { instruction: string } — e.g. "accept the proposal and suggest Tuesday"
// Returns: { draft: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, {
    name: "inbox:reply",
    limit: 20,
    windowMs: 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = inboxReplySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { instruction } = parsed.data

  const email = await db.inboxEmail.findFirst({ where: { id, userId: auth.user.id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const draft = await draftEmailReply(
    email.fromAddress,
    email.subject,
    email.body,
    instruction
  )

  return NextResponse.json({ draft })
}
