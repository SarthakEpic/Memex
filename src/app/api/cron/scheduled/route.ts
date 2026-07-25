import { NextRequest, NextResponse } from "next/server"
import { runProductionScheduler } from "@/server/services/scheduler"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const rejected = rejectUnauthorizedCron(req)
  if (rejected) return rejected

  const result = await runProductionScheduler()
  return NextResponse.json({ ok: true, ...result })
}

function rejectUnauthorizedCron(req: NextRequest): NextResponse | null {
  const configuredSecret = process.env.CRON_SECRET?.trim()
  if (configuredSecret) {
    const auth = req.headers.get("authorization") || ""
    const querySecret = req.nextUrl.searchParams.get("secret") || ""
    if (auth === `Bearer ${configuredSecret}` || querySecret === configuredSecret) {
      return null
    }
    return NextResponse.json({ error: "Invalid cron secret" }, { status: 401 })
  }

  if (process.env.NODE_ENV !== "production") return null

  const userAgent = req.headers.get("user-agent") || ""
  if (userAgent.includes("vercel-cron/1.0")) return null

  return NextResponse.json(
    { error: "CRON_SECRET is required for non-Vercel production cron calls" },
    { status: 401 }
  )
}
