import { NextRequest, NextResponse } from "next/server"
import { getUserFromRequest, type AuthUser } from "./session"

export type AuthResult =
  | { user: AuthUser }
  | { response: NextResponse }

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

export async function requireUser(req: NextRequest | Request): Promise<AuthResult> {
  const invalidOrigin = rejectInvalidOrigin(req)
  if (invalidOrigin) return { response: invalidOrigin }

  const user = await getUserFromRequest(req)
  if (!user) {
    return {
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    }
  }

  return { user }
}

export function isAuthFailure(result: AuthResult): result is { response: NextResponse } {
  return "response" in result
}

export function rejectInvalidOrigin(req: NextRequest | Request): NextResponse | null {
  if (hasValidOrigin(req)) return null
  return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
}

function hasValidOrigin(req: NextRequest | Request): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return true

  const origin = req.headers.get("origin")
  if (!origin) return true

  const host = req.headers.get("host")
  if (!host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
