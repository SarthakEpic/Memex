import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { draftEmailReply } from "@/lib/llm"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// POST /api/inbox/[id]/reply
// Body: { instruction: string } — e.g. "accept the proposal and suggest Tuesday"
// Returns: { draft: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { instruction } = body as { instruction?: string }

  if (!instruction) {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 })
  }

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
