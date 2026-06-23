import { NextRequest, NextResponse } from "next/server"
import { generateEmailSubject } from "@/lib/llm"

// POST /api/chat/email-subject
// Body: { bodyMarkdown: string }
// Returns: { subject: string | null }
//
// Generates a concise, professional subject line based on the email body.
// Used when the user edits the body — the subject can be auto-updated to
// stay relevant to the new content.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { bodyMarkdown } = body as { bodyMarkdown?: string }

  if (!bodyMarkdown || typeof bodyMarkdown !== "string") {
    return NextResponse.json(
      { error: "bodyMarkdown is required" },
      { status: 400 }
    )
  }

  const subject = await generateEmailSubject(bodyMarkdown)

  if (!subject) {
    return NextResponse.json(
      { error: "Failed to generate subject. The AI service may be rate-limited." },
      { status: 503 }
    )
  }

  return NextResponse.json({ subject })
}
