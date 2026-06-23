import { NextRequest, NextResponse } from "next/server"
import { regenerateEmailDraft, type EmailDraftResult } from "@/lib/llm"

// POST /api/chat/email-regenerate
// Body: { instruction: string, previousDraft: EmailDraftResult, feedback: string }
// Returns: { draft: EmailDraftResult | null }
//
// Re-generates an email draft based on user feedback ("make it shorter",
// "more formal", etc.). The body of the returned draft is EXACTLY what will
// be sent — no chat history, no preamble.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { instruction, previousDraft, feedback } = body as {
    instruction?: string
    previousDraft?: EmailDraftResult
    feedback?: string
  }

  if (!instruction || !previousDraft || !feedback) {
    return NextResponse.json(
      { error: "instruction, previousDraft, and feedback are required" },
      { status: 400 }
    )
  }

  const draft = await regenerateEmailDraft(instruction, previousDraft, feedback)

  if (!draft) {
    return NextResponse.json(
      { error: "Failed to regenerate draft. The AI service may be rate-limited — please try again in a moment." },
      { status: 503 }
    )
  }

  return NextResponse.json({ draft })
}
