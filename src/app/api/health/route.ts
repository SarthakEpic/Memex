import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isSystemMailerConfigured } from "@/server/auth/system-mail"

export const dynamic = "force-dynamic"

export async function GET() {
  const startedAt = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({
      ok: true,
      db: "ok",
      systemMailerConfigured: isSystemMailerConfigured(),
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    )
  }
}
