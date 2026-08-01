import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { chatMessageDraftUpdateSchema } from "@/server/validation/mutations"

// PATCH /api/chat/sessions/[id]/messages/[messageId]
// Body: { emailDraft?: EmailDraftPayload }
//
// Updates the emailDraft field on a chat message. Used by the EmailDraftCard
// to persist state changes (edits, status updates, timeline events) back to
// the server so they survive page reloads and session switches.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id, messageId } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = chatMessageDraftUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { emailDraft } = parsed.data

  // Verify the message belongs to the session
  const existing = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: { sessionId: true, userId: true },
  })
  if (!existing || existing.sessionId !== id || existing.userId !== auth.user.id) {
    return NextResponse.json({ error: "Message not found in this session" }, { status: 404 })
  }

  const updated = await db.chatMessage.update({
    where: { id: messageId },
    data: {
      emailDraft: JSON.stringify(emailDraft),
    },
  })

  return NextResponse.json({
    ok: true,
    messageId: updated.id,
    emailDraft:
      typeof updated.emailDraft === "string" && updated.emailDraft.startsWith("{")
        ? JSON.parse(updated.emailDraft)
        : null,
  })
}
