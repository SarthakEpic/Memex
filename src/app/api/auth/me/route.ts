import { NextRequest, NextResponse } from "next/server"
import { getUserFromRequest } from "@/server/auth/session"

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({ user })
}
