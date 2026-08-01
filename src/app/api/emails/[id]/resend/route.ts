import { NextRequest, NextResponse } from "next/server"
import { executeSend } from "@/lib/email"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// POST /api/emails/[id]/resend
// Retry sending a failed email
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const result = await executeSend(id, auth.user.id)

  if (result.delivered || result.status === "saved") {
    return NextResponse.json({
      ...result,
      message: result.delivered
        ? "Email accepted by the connected SMTP server."
        : "No mail provider is connected. The email remains saved locally and was not sent.",
    })
  } else {
    return NextResponse.json({
      ...result,
      message: `Resend failed: ${result.error || "Unknown error"}`,
    }, { status: 500 })
  }
}
