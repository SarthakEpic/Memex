import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logWarn } from "@/server/observability/logger"

interface Bucket {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  name: string
  limit: number
  windowMs: number
  userId?: string
}

const buckets = new Map<string, Bucket>()
let lastDatabasePruneAt = 0

export async function rateLimit(
  req: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  if (process.env.RATE_LIMIT_BACKEND === "database") {
    try {
      return await databaseRateLimit(req, options)
    } catch (error) {
      logWarn("rate_limit.database_failed", {
        limiter: options.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return memoryRateLimit(req, options)
}

function memoryRateLimit(req: NextRequest, options: RateLimitOptions): NextResponse | null {
  const now = Date.now()
  const identity = options.userId ? `user:${options.userId}` : getClientIdentity(req)
  const key = `${options.name}:${identity}`
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return null
  }

  current.count++
  if (current.count <= options.limit) return null

  const retryAfter = Math.ceil((current.resetAt - now) / 1000)
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
      },
    }
  )
}

async function databaseRateLimit(
  req: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const now = Date.now()
  const identity = options.userId ? `user:${options.userId}` : getClientIdentity(req)
  const key = `${options.name}:${identity}`
  const nowDate = new Date(now)
  const resetAt = new Date(now + options.windowMs)

  if (now - lastDatabasePruneAt > 60_000) {
    lastDatabasePruneAt = now
    db.rateLimitBucket
      .deleteMany({ where: { resetAt: { lt: nowDate } } })
      .catch((error) =>
        logWarn("rate_limit.prune_failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      )
  }

  const current = await db.rateLimitBucket.findUnique({ where: { key } })
  if (!current || current.resetAt.getTime() <= now) {
    await db.rateLimitBucket.upsert({
      where: { key },
      create: { key, userId: options.userId, count: 1, resetAt },
      update: { userId: options.userId, count: 1, resetAt },
    })
    return null
  }

  const updated = await db.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  })

  if (updated.count <= options.limit) return null

  const retryAfter = Math.ceil((current.resetAt.getTime() - now) / 1000)
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
      },
    }
  )
}

export function resetRateLimitsForTests(): void {
  buckets.clear()
  lastDatabasePruneAt = 0
}

function getClientIdentity(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const realIp = req.headers.get("x-real-ip")?.trim()
  return forwardedFor || realIp || "local"
}
