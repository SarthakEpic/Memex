import { NextRequest, NextResponse } from "next/server"
import { rejectInvalidOrigin } from "@/server/auth/guard"
import { clearSessionCookie, destroyUserSession } from "@/server/auth/session"

export async function POST(req: NextRequest) {
  const invalidOrigin = rejectInvalidOrigin(req)
  if (invalidOrigin) return invalidOrigin

  await destroyUserSession(req)
  return clearSessionCookie(NextResponse.json({ ok: true }))
}
