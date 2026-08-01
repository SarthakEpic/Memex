import crypto from "node:crypto"
import { db } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/server/security/encryption"
import type { EmailAccount } from "@prisma/client"

export const EMAIL_OAUTH_PROVIDERS = ["google", "microsoft"] as const
export type EmailOAuthProvider = (typeof EMAIL_OAUTH_PROVIDERS)[number]

export const EMAIL_OAUTH_STATE_COOKIE = "memex_email_oauth"
const STATE_TTL_MS = 10 * 60 * 1000
const TOKEN_REFRESH_SKEW_MS = 60 * 1000

type ProviderConfig = {
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
}

type OAuthState = {
  state: string
  userId: string
  provider: EmailOAuthProvider
  codeVerifier: string
  expiresAt: number
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export class EmailOAuthError extends Error {
  constructor(
    message: string,
    public readonly needsReconnect = false
  ) {
    super(message)
    this.name = "EmailOAuthError"
  }
}

export function isEmailOAuthProvider(value: string): value is EmailOAuthProvider {
  return EMAIL_OAUTH_PROVIDERS.includes(value as EmailOAuthProvider)
}

export function getOAuthProviderAvailability(): Record<EmailOAuthProvider, boolean> {
  return {
    google: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    microsoft: Boolean(process.env.MICROSOFT_OAUTH_CLIENT_ID && process.env.MICROSOFT_OAUTH_CLIENT_SECRET),
  }
}

export function getOAuthRedirectUri(provider: EmailOAuthProvider, requestUrl: string): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "")
  if (configured) {
    const base = new URL(configured)
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
      throw new EmailOAuthError("APP_BASE_URL must use HTTPS in production.")
    }
    return `${base.origin}/api/email-accounts/oauth/${provider}/callback`
  }

  if (process.env.NODE_ENV === "production") {
    throw new EmailOAuthError("Email OAuth is not configured. Set APP_BASE_URL first.")
  }

  const origin = new URL(requestUrl).origin
  return `${origin}/api/email-accounts/oauth/${provider}/callback`
}

export function createEmailOAuthStart(input: {
  provider: EmailOAuthProvider
  userId: string
  requestUrl: string
}): { authorizationUrl: string; stateCookie: string } {
  const config = getProviderConfig(input.provider)
  const state = crypto.randomBytes(32).toString("base64url")
  const codeVerifier = crypto.randomBytes(48).toString("base64url")
  const redirectUri = getOAuthRedirectUri(input.provider, input.requestUrl)
  const payload: OAuthState = {
    state,
    userId: input.userId,
    provider: input.provider,
    codeVerifier,
    expiresAt: Date.now() + STATE_TTL_MS,
  }

  const url = new URL(config.authorizeUrl)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", config.scopes.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", sha256Base64Url(codeVerifier))
  url.searchParams.set("code_challenge_method", "S256")

  if (input.provider === "google") {
    url.searchParams.set("access_type", "offline")
    url.searchParams.set("prompt", "consent")
    url.searchParams.set("include_granted_scopes", "true")
  }

  return { authorizationUrl: url.toString(), stateCookie: sealState(payload) }
}

export function validateEmailOAuthState(input: {
  stateCookie: string | undefined
  receivedState: string | null
  userId: string
  provider: EmailOAuthProvider
}): OAuthState {
  if (!input.stateCookie || !input.receivedState) {
    throw new EmailOAuthError("The connection request expired. Start again from Smart Inbox.")
  }

  const state = unsealState(input.stateCookie)
  if (
    state.userId !== input.userId ||
    state.provider !== input.provider ||
    state.expiresAt < Date.now() ||
    !safeEqual(state.state, input.receivedState)
  ) {
    throw new EmailOAuthError("The connection request could not be verified. Start again from Smart Inbox.")
  }

  return state
}

export async function exchangeEmailOAuthCode(input: {
  provider: EmailOAuthProvider
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<{
  emailAddress: string
  displayName: string
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scopes: string
}> {
  const config = getProviderConfig(input.provider)
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  })
  const token = await requestToken(config.tokenUrl, body)
  if (!token.access_token || !token.refresh_token) {
    throw new EmailOAuthError("The provider did not grant long-lived email access. Please approve access and try again.")
  }

  const profile = await fetchProfile(input.provider, token.access_token)
  return {
    ...profile,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
    scopes: config.scopes.join(" "),
  }
}

export async function getOAuthAccessToken(account: EmailAccount, forceRefresh = false): Promise<string> {
  const provider = parseAccountProvider(account)
  if (!provider || !account.oauthRefreshToken) {
    throw new EmailOAuthError("This account is missing its OAuth connection. Reconnect it from Smart Inbox.", true)
  }

  const expiresSoon = !account.oauthTokenExpiresAt || account.oauthTokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_SKEW_MS
  if (!forceRefresh && !expiresSoon && account.oauthAccessToken) {
    return decryptSecret(account.oauthAccessToken)
  }

  const config = getProviderConfig(provider)
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: decryptSecret(account.oauthRefreshToken),
    grant_type: "refresh_token",
  })
  const token = await requestToken(config.tokenUrl, body, account.id)
  if (!token.access_token) {
    throw new EmailOAuthError("The email provider did not return an access token. Reconnect this account.", true)
  }

  await db.emailAccount.update({
    where: { id: account.id },
    data: {
      oauthAccessToken: encryptSecret(token.access_token),
      oauthRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : account.oauthRefreshToken,
      oauthTokenExpiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
      connected: true,
    },
  })

  return token.access_token
}

export async function oauthProviderFetch(
  account: EmailAccount,
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  let token = await getOAuthAccessToken(account)
  let response = await fetch(input, withBearerToken(init, token))
  if (response.status !== 401) return response

  token = await getOAuthAccessToken(account, true)
  response = await fetch(input, withBearerToken(init, token))
  return response
}

export async function disconnectOAuthAccount(account: EmailAccount): Promise<void> {
  const provider = parseAccountProvider(account)
  if (provider === "google" && account.oauthRefreshToken) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(account.oauthRefreshToken) }),
      })
    } catch {
      // Local token removal below still disconnects Memex if the provider is unavailable.
    }
  }
}

export async function sendOAuthEmail(
  account: EmailAccount,
  input: { toAddress: string; subject: string; bodyMarkdown: string; bodyHtml: string }
): Promise<void> {
  const provider = parseAccountProvider(account)
  if (!provider) {
    throw new EmailOAuthError("This account is not connected through OAuth.", true)
  }

  if (provider === "google") {
    const raw = createRfc822Message(account, input)
    const response = await oauthProviderFetch(
      account,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
      }
    )
    if (!response.ok) throw await providerSendFailure("Google", response)
    return
  }

  const response = await oauthProviderFetch(account, "https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.bodyHtml },
        toRecipients: [{ emailAddress: { address: input.toAddress } }],
      },
      saveToSentItems: true,
    }),
  })
  if (!response.ok) throw await providerSendFailure("Microsoft", response)
}
function getProviderConfig(provider: EmailOAuthProvider): ProviderConfig {
  const configs: Record<EmailOAuthProvider, ProviderConfig> = {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    },
    microsoft: {
      clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? "",
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "https://graph.microsoft.com/Mail.ReadWrite",
        "https://graph.microsoft.com/Mail.Send",
      ],
    },
  }
  const config = configs[provider]
  if (!config.clientId || !config.clientSecret) {
    throw new EmailOAuthError(`${provider === "google" ? "Google" : "Microsoft"} email connection is not configured yet.`)
  }
  return config
}

async function requestToken(tokenUrl: string, body: URLSearchParams, accountId?: string): Promise<TokenResponse> {
  let response: Response
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    })
  } catch {
    throw new EmailOAuthError("Could not reach the email provider. Try again shortly.")
  }

  const token = (await response.json().catch(() => ({}))) as TokenResponse
  if (response.ok) return token

  if (accountId && token.error === "invalid_grant") {
    await db.emailAccount.update({
      where: { id: accountId },
      data: { connected: false, oauthAccessToken: "", oauthTokenExpiresAt: null },
    })
    throw new EmailOAuthError("Your email access was revoked or expired. Reconnect this account.", true)
  }

  throw new EmailOAuthError("The email provider rejected the connection. Start the connection again.")
}

async function fetchProfile(
  provider: EmailOAuthProvider,
  accessToken: string
): Promise<{ emailAddress: string; displayName: string }> {
  const request =
    provider === "google"
      ? "https://www.googleapis.com/oauth2/v3/userinfo"
      : "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName"
  const response = await fetch(request, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!response.ok) {
    throw new EmailOAuthError("The email provider could not identify this account. Try again.")
  }
  const profile = (await response.json()) as {
    email?: string
    name?: string
    displayName?: string
    mail?: string
    userPrincipalName?: string
  }
  const emailAddress = (provider === "google" ? profile.email : profile.mail || profile.userPrincipalName)?.trim().toLowerCase()
  if (!emailAddress || !emailAddress.includes("@")) {
    throw new EmailOAuthError("The email provider did not return a usable email address.")
  }
  return {
    emailAddress,
    displayName: (provider === "google" ? profile.name : profile.displayName)?.trim() || emailAddress.split("@")[0],
  }
}

function parseAccountProvider(account: Pick<EmailAccount, "provider">): EmailOAuthProvider | null {
  return isEmailOAuthProvider(account.provider) ? account.provider : null
}

function withBearerToken(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${token}`)
  return { ...init, headers, cache: "no-store" }
}

function createRfc822Message(
  account: EmailAccount,
  input: { toAddress: string; subject: string; bodyMarkdown: string; bodyHtml: string }
): string {
  const boundary = `memex-${crypto.randomBytes(12).toString("hex")}`
  const fromName = account.displayName || account.emailAddress
  return [
    `From: ${encodeHeader(fromName)} <${account.emailAddress}>`,
    `To: ${input.toAddress}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.bodyMarkdown, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.bodyHtml, "utf8").toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n")
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value.replace(/[\r\n]/g, " "), "utf8").toString("base64")}?=`
}

async function providerSendFailure(provider: string, response: Response): Promise<EmailOAuthError> {
  if (response.status === 401 || response.status === 403) {
    return new EmailOAuthError(`${provider} access expired or was revoked. Reconnect this account.`, true)
  }
  return new EmailOAuthError(`${provider} did not accept the email. Try again shortly.`)
}
function sealState(payload: OAuthState): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${encoded}.${sign(encoded)}`
}

function unsealState(value: string): OAuthState {
  const [encoded, signature] = value.split(".")
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) {
    throw new EmailOAuthError("The connection request could not be verified. Start again from Smart Inbox.")
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.userId !== "string" ||
      !isEmailOAuthProvider(parsed.provider) ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      throw new Error("Malformed state")
    }
    return parsed
  } catch {
    throw new EmailOAuthError("The connection request could not be verified. Start again from Smart Inbox.")
  }
}

function sign(value: string): string {
  const key = process.env.ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? "" : "memex-development-only-encryption-key")
  if (!key) throw new EmailOAuthError("ENCRYPTION_KEY is required for email OAuth.")
  return crypto.createHmac("sha256", key).update(value).digest("base64url")
}

function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url")
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}
