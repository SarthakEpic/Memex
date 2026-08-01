import { NextRequest, NextResponse } from "next/server"
import { regenerateEmailDraft } from "@/lib/llm"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import { validationError } from "@/server/validation/api"
import { emailRegenerateSchema } from "@/server/validation/mutations"

// POST /api/chat/email-regenerate
// Body: { instruction: string, previousDraft: EmailDraftResult, feedback: string }
// Returns: { draft: EmailDraftResult | null }
//
// Re-generates an email draft based on user feedback ("make it shorter",
// "more formal", etc.). The body of the returned draft is EXACTLY what will
// be sent — no chat history, no preamble.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, {
    name: "chat:email-regenerate",
    limit: 20,
    windowMs: 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = emailRegenerateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { instruction, previousDraft, feedback } = parsed.data

  const draft = await regenerateEmailDraft(instruction, previousDraft, feedback)

  if (!draft) {
    return NextResponse.json(
      { error: "Failed to regenerate draft. The AI service may be rate-limited — please try again in a moment." },
      { status: 503 }
    )
  }

  return NextResponse.json({ draft })
}
