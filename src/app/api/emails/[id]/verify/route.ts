import { NextRequest, NextResponse } from "next/server"
import { verifyEmail } from "@/lib/email"

// POST /api/emails/[id]/verify
// Called after human verification challenge is completed.
// Actually sends the email via SMTP and returns the real result.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await verifyEmail(id)

  if (result.delivered) {
    return NextResponse.json({
      ...result,
      message: result.realSend
        ? "Email sent and confirmed by SMTP server ✓"
        : "Email saved locally (no SMTP credentials connected)",
    })
  } else {
    return NextResponse.json({
      ...result,
      message: `Failed to send: ${result.error || "Unknown error"}`,
    }, { status: 500 })
  }
}
