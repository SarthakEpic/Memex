import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { processScheduledEmails } from "@/lib/email"

// GET /api/scheduled-check
// Called periodically (cron) to:
// 1. Deliver scheduled emails that are due
// 2. Process any other time-based tasks
// This acts as the "background worker" since we don't have a real cron daemon.
export async function GET() {
  const delivered = await processScheduledEmails()
  return NextResponse.json({
    ok: true,
    delivered,
    timestamp: new Date().toISOString(),
  })
}
