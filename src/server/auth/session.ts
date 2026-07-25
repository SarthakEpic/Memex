import { createHash, randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const SESSION_COOKIE = "memex_session"
const SESSION_DAYS = 30

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

export function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function createUserSession(userId: string): Promise<{
  token: string
  expiresAt: Date
}> {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await db.authSession.create({
    data: {
      userId,
      tokenHash: sessionTokenHash(token),
      expiresAt,
    },
  })

  return { token, expiresAt }
}

export async function getUserFromRequest(req: NextRequest | Request): Promise<AuthUser | null> {
  const token = getCookie(req, SESSION_COOKIE)
  if (!token) return null

  const session = await db.authSession.findUnique({
    where: { tokenHash: sessionTokenHash(token) },
    include: { user: true },
  })

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await db.authSession.delete({ where: { id: session.id } }).catch(() => undefined)
    }
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  }
}

export async function destroyUserSession(req: NextRequest | Request): Promise<void> {
  const token = getCookie(req, SESSION_COOKIE)
  if (!token) return

  await db.authSession
    .deleteMany({ where: { tokenHash: sessionTokenHash(token) } })
    .catch(() => undefined)
}

export function attachSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  })
  return response
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return response
}

function getCookie(req: NextRequest | Request, name: string): string {
  if (req instanceof NextRequest) {
    return req.cookies.get(name)?.value ?? ""
  }

  const cookieHeader = req.headers.get("cookie") ?? ""
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim())
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}
