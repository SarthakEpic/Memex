import { describe, expect, it, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./encryption"
import { rateLimit, resetRateLimitsForTests } from "./rate-limit"
import { isBlockedHostname, isPrivateIp } from "./url"

describe("encrypted secrets", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-key-that-is-long-enough-for-secret-crypto"
  })

  it("round-trips secrets without storing plaintext", () => {
    const encrypted = encryptSecret("app-password")

    expect(isEncryptedSecret(encrypted)).toBe(true)
    expect(encrypted).not.toContain("app-password")
    expect(decryptSecret(encrypted)).toBe("app-password")
  })

  it("keeps legacy plaintext readable for migration compatibility", () => {
    expect(decryptSecret("legacy-password")).toBe("legacy-password")
  })
})

describe("URL safety checks", () => {
  it("blocks local hostnames and private IP ranges", () => {
    expect(isBlockedHostname("localhost")).toBe(true)
    expect(isBlockedHostname("app.local")).toBe(true)
    expect(isPrivateIp("127.0.0.1")).toBe(true)
    expect(isPrivateIp("10.0.0.8")).toBe(true)
    expect(isPrivateIp("172.16.0.1")).toBe(true)
    expect(isPrivateIp("192.168.1.10")).toBe(true)
    expect(isPrivateIp("169.254.169.254")).toBe(true)
    expect(isPrivateIp("8.8.8.8")).toBe(false)
  })
})

describe("rate limiter", () => {
  beforeEach(() => {
    delete process.env.RATE_LIMIT_BACKEND
    resetRateLimitsForTests()
  })

  it("allows requests within the window and rejects excess requests", async () => {
    const req = new NextRequest("http://memex.local/api/test", {
      headers: { "x-real-ip": "203.0.113.10" },
    })

    await expect(rateLimit(req, { name: "test", limit: 2, windowMs: 60_000 })).resolves.toBeNull()
    await expect(rateLimit(req, { name: "test", limit: 2, windowMs: 60_000 })).resolves.toBeNull()

    const rejected = await rateLimit(req, { name: "test", limit: 2, windowMs: 60_000 })
    expect(rejected?.status).toBe(429)
  })
})
