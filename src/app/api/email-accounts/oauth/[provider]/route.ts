import { NextRequest, NextResponse } from "next/server"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { rateLimit } from "@/server/security/rate-limit"
import {
  EMAIL_OAUTH_STATE_COOKIE,
  createEmailOAuthStart,
  isEmailOAuthProvider,
} from "@/server/email/oauth"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { provider } = await params
  if (!isEmailOAuthProvider(provider)) {
    return NextResponse.json({ error: "Unsupported email provider" }, { status: 404 })
  }

  const limited = await rateLimit(req, {
    name: "email-oauth:start",
    limit: 10,
    windowMs: 10 * 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  try {
    const flow = createEmailOAuthStart({
      provider,
      userId: auth.user.id,
      requestUrl: req.url,
    })
    const response = NextResponse.redirect(flow.authorizationUrl)
    response.cookies.set({
      name: EMAIL_OAUTH_STATE_COOKIE,
      value: flow.stateCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/email-accounts/oauth",
      maxAge: 10 * 60,
    })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email OAuth could not be started."
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
