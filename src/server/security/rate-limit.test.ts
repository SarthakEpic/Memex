import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

describe("database-backed rate limiter", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_BACKEND
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("uses the shared database bucket when RATE_LIMIT_BACKEND=database", async () => {
    const buckets = new Map<string, { key: string; count: number; resetAt: Date }>()
    const rateLimitBucket = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        return buckets.get(where.key) ?? null
      }),
      upsert: vi.fn(async ({ where, create, update }) => {
        const current = buckets.get(where.key)
        const next = current
          ? { ...current, count: update.count, resetAt: update.resetAt }
          : { key: create.key, count: create.count, resetAt: create.resetAt }
        buckets.set(where.key, next)
        return next
      }),
      update: vi.fn(async ({ where, data }) => {
        const current = buckets.get(where.key)
        if (!current) throw new Error("Missing bucket")

        const next = {
          ...current,
          count: current.count + data.count.increment,
        }
        buckets.set(where.key, next)
        return next
      }),
    }

    vi.doMock("@/lib/db", () => ({ db: { rateLimitBucket } }))
    process.env.RATE_LIMIT_BACKEND = "database"

    const { rateLimit } = await import("./rate-limit")
    const req = new NextRequest("http://memex.local/api/test", {
      headers: { "x-real-ip": "203.0.113.42" },
    })

    await expect(rateLimit(req, { name: "test-db", limit: 1, windowMs: 60_000 })).resolves.toBeNull()
    const rejected = await rateLimit(req, { name: "test-db", limit: 1, windowMs: 60_000 })

    expect(rejected?.status).toBe(429)
    expect(rateLimitBucket.upsert).toHaveBeenCalledTimes(1)
    expect(rateLimitBucket.update).toHaveBeenCalledTimes(1)
  })
})
