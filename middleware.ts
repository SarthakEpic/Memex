import { NextRequest, NextResponse } from "next/server"

const PUBLIC_FILE = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|json|css|js|map|woff2?)$/i
const SESSION_COOKIE = "memex_session"
const AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password", "/reset-password"])
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/health", "/api/cron/"]

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next()
  }

  const hasSessionCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value)

  if (AUTH_PATHS.has(pathname)) {
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL("/", req.url))
    }
    return NextResponse.next()
  }

  if (hasSessionCookie) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  return NextResponse.redirect(new URL("/login", req.url))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
