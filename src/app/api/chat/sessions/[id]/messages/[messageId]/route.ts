import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

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
  const { id, messageId } = await params
  const body = await req.json().catch(() => ({}))
  const { emailDraft } = body as { emailDraft?: unknown }

  if (emailDraft === undefined) {
    return NextResponse.json({ error: "emailDraft is required" }, { status: 400 })
  }

  // Verify the message belongs to the session
  const existing = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: { sessionId: true },
  })
  if (!existing || existing.sessionId !== id) {
    return NextResponse.json({ error: "Message not found in this session" }, { status: 404 })
  }

  const updated = await db.chatMessage.update({
    where: { id: messageId },
    data: {
      emailDraft:
        typeof emailDraft === "string" ? emailDraft : JSON.stringify(emailDraft),
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
