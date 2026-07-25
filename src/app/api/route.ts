import { NextRequest, NextResponse } from "next/server"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  return NextResponse.json({ message: "Memex API is ready." })
}
