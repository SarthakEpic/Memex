import { describe, expect, it } from "vitest"
import { formatInboxChatAnswer, parseInboxChatQuery } from "./inbox-chat"

describe("local inbox chat answers", () => {
  it("recognizes a recent-mail question without involving an AI provider", () => {
    const now = new Date("2026-07-29T12:00:00.000Z")
    const query = parseInboxChatQuery("Did I get any mail in the last 10 minutes?", now)

    expect(query?.timeDescription).toBe("in the last 10 minutes")
    expect(query?.receivedAfter?.toISOString()).toBe("2026-07-29T11:50:00.000Z")
  })

  it("formats a direct local answer for matching mail", () => {
    const query = parseInboxChatQuery("Any important mail?", new Date("2026-07-29T12:00:00.000Z"))
    expect(query).not.toBeNull()

    const answer = formatInboxChatAnswer(query!, [{
      fromName: "Finance",
      fromAddress: "finance@example.com",
      subject: "Approval required",
      receivedAt: new Date("2026-07-29T11:59:00.000Z"),
    }])

    expect(answer).toContain("Finance")
    expect(answer).toContain("Approval required")
  })
})
