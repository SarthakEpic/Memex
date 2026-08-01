import { NextRequest, NextResponse } from "next/server"
import { clearSessionCookie, getUserFromRequest } from "@/server/auth/session"

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return clearSessionCookie(
      NextResponse.json({ user: null }, { status: 401 })
    )
  }

  return NextResponse.json({ user })
}
