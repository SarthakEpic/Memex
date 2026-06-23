import { NextRequest, NextResponse } from "next/server"
import { executeSend } from "@/lib/email"

// POST /api/emails/[id]/resend
// Retry sending a failed email
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await executeSend(id)

  if (result.delivered) {
    return NextResponse.json({
      ...result,
      message: result.realSend
        ? "Email resent successfully ✓"
        : "Email saved locally (no SMTP credentials)",
    })
  } else {
    return NextResponse.json({
      ...result,
      message: `Resend failed: ${result.error || "Unknown error"}`,
    }, { status: 500 })
  }
}
