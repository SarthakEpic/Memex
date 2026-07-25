import { NextRequest, NextResponse } from "next/server"
import { consumeEmailVerificationToken } from "@/server/auth/tokens"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || ""
  const result = token ? await consumeEmailVerificationToken(token) : { ok: false }
  const redirect = new URL("/login", req.url)
  redirect.searchParams.set(result.ok ? "verified" : "verify_error", "1")
  return NextResponse.redirect(redirect)
}
