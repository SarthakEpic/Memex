import { NextRequest, NextResponse } from "next/server"
import { processScheduledEmails } from "@/lib/email"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// POST /api/scheduled-check
// Called periodically (cron) to:
// 1. Deliver scheduled emails that are due
// 2. Process any other time-based tasks
// This acts as the "background worker" since we don't have a real cron daemon.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const delivered = await processScheduledEmails(auth.user.id)
  return NextResponse.json({
    ok: true,
    delivered,
    timestamp: new Date().toISOString(),
  })
}
