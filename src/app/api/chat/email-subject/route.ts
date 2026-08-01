import { NextRequest, NextResponse } from "next/server"
import { generateEmailSubject } from "@/lib/llm"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import { validationError } from "@/server/validation/api"
import { emailSubjectSchema } from "@/server/validation/mutations"

// POST /api/chat/email-subject
// Body: { bodyMarkdown: string }
// Returns: { subject: string | null }
//
// Generates a concise, professional subject line based on the email body.
// Used when the user edits the body — the subject can be auto-updated to
// stay relevant to the new content.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, {
    name: "chat:email-subject",
    limit: 30,
    windowMs: 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = emailSubjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { bodyMarkdown } = parsed.data

  const subject = await generateEmailSubject(bodyMarkdown)

  if (!subject) {
    return NextResponse.json(
      { error: "Failed to generate subject. The AI service may be rate-limited." },
      { status: 503 }
    )
  }

  return NextResponse.json({ subject })
}
