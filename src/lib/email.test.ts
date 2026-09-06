import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), account: vi.fn(), send: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: { email: { findFirst: mocks.findFirst, updateMany: mocks.updateMany, update: mocks.update }, emailAccount: { findFirst: mocks.account } } }))
vi.mock("@/server/email/oauth", () => ({ isEmailOAuthProvider: () => true, sendOAuthEmail: mocks.send }))
import { executeSend, verifyEmail } from "./email"

describe("email delivery guards", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.findFirst.mockResolvedValue({ id: "mail", userId: "owner", status: "queued", scheduledFor: null, accountId: "account" })
    mocks.account.mockResolvedValue({ provider: "google", oauthRefreshToken: "test" })
  })

  it("does not contact a provider when the atomic claim fails", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await executeSend("mail", "owner")
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.account).not.toHaveBeenCalled()
  })

  it("allows only one concurrent sender to contact the provider", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await Promise.all([executeSend("mail", "owner"), executeSend("mail", "owner")])
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.updateMany.mock.calls[0][0].where).toMatchObject({ userId: "owner", verified: true })
  })

  it("does not reapprove an already processed email", async () => {
    mocks.findFirst.mockResolvedValue({ id: "mail", status: "delivered", scheduledFor: null })
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await verifyEmail("mail", "owner")
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.updateMany.mock.calls[0][0].where.status).toBe("pending_verification")
  })
})
