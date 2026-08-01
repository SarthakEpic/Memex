import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { encryptSecret } from "@/server/security/encryption"
import {
  EMAIL_OAUTH_STATE_COOKIE,
  EmailOAuthError,
  exchangeEmailOAuthCode,
  getOAuthRedirectUri,
  isEmailOAuthProvider,
  validateEmailOAuthState,
} from "@/server/email/oauth"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerValue } = await params
  const provider = isEmailOAuthProvider(providerValue) ? providerValue : null
  if (!provider) return redirectWithResult(req, "error")

  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return redirectWithResult(req, "reauthenticate")

  const response = createCallbackResponse(req)
  try {
    if (req.nextUrl.searchParams.get("error")) {
      throw new EmailOAuthError("The email connection was cancelled or denied.")
    }

    const state = validateEmailOAuthState({
      stateCookie: req.cookies.get(EMAIL_OAUTH_STATE_COOKIE)?.value,
      receivedState: req.nextUrl.searchParams.get("state"),
      userId: auth.user.id,
      provider,
    })
    const code = req.nextUrl.searchParams.get("code")
    if (!code || code.length > 2_000) {
      throw new EmailOAuthError("The email provider did not return a valid authorization code.")
    }

    const connection = await exchangeEmailOAuthCode({
      provider,
      code,
      codeVerifier: state.codeVerifier,
      redirectUri: getOAuthRedirectUri(provider, req.url),
    })
    await db.emailAccount.upsert({
      where: {
        userId_emailAddress: {
          userId: auth.user.id,
          emailAddress: connection.emailAddress,
        },
      },
      create: {
        userId: auth.user.id,
        emailAddress: connection.emailAddress,
        displayName: connection.displayName,
        provider,
        oauthAccessToken: encryptSecret(connection.accessToken),
        oauthRefreshToken: encryptSecret(connection.refreshToken),
        oauthTokenExpiresAt: connection.expiresAt,
        oauthScopes: connection.scopes,
        connected: true,
        syncMode: "oauth",
      },
      update: {
        displayName: connection.displayName,
        provider,
        oauthAccessToken: encryptSecret(connection.accessToken),
        oauthRefreshToken: encryptSecret(connection.refreshToken),
        oauthTokenExpiresAt: connection.expiresAt,
        oauthScopes: connection.scopes,
        imapPassword: "",
        smtpPassword: "",
        connected: true,
        syncMode: "oauth",
      },
    })

    response.headers.set("location", callbackLocation(req, "connected"))
  } catch (error) {
    console.warn("Email OAuth callback failed", {
      provider,
      userId: auth.user.id,
      reason: error instanceof Error ? error.message : "unknown",
    })
    response.headers.set("location", callbackLocation(req, "error"))
  }

  response.cookies.set({
    name: EMAIL_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/email-accounts/oauth",
    maxAge: 0,
  })
  return response
}

function createCallbackResponse(req: NextRequest): NextResponse {
  return NextResponse.redirect(callbackLocation(req, "error"))
}

function redirectWithResult(req: NextRequest, result: "error" | "reauthenticate"): NextResponse {
  return NextResponse.redirect(callbackLocation(req, result))
}

function callbackLocation(req: NextRequest, result: "connected" | "error" | "reauthenticate"): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "")
  const base = configured || req.nextUrl.origin
  const url = new URL("/", base)
  url.searchParams.set("section", "inbox")
  url.searchParams.set("email_connection", result)
  return url.toString()
}
