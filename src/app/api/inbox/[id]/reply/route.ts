import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { draftEmailReply } from "@/lib/llm"

// POST /api/inbox/[id]/reply
// Body: { instruction: string } — e.g. "accept the proposal and suggest Tuesday"
// Returns: { draft: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { instruction } = body as { instruction?: string }

  if (!instruction) {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 })
  }

  const email = await db.inboxEmail.findUnique({ where: { id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const draft = await draftEmailReply(
    email.fromAddress,
    email.subject,
    email.body,
    instruction
  )

  return NextResponse.json({ draft })
}
