import { describe, expect, it } from "vitest"
import { compactChatHistoryContent, formatInboxEmailForChat, parseEmailDisplayIntent, rankInboxEmailMatch } from "./chat-email"

describe("chat email selection", () => {
  it("extracts a sender from a request to open an email", () => {
    expect(parseEmailDisplayIntent("open Paras Plays email")).toEqual({
      query: "Paras Plays",
      useActiveEmail: false,
    })
  })

  it("keeps the active email for natural follow-up requests", () => {
    expect(parseEmailDisplayIntent("show me here")).toEqual({ useActiveEmail: true })
    expect(parseEmailDisplayIntent("what did he write?")).toEqual({ useActiveEmail: true })
  })

  it("prefers an exact sender match over a subject-only match", () => {
    const score = rankInboxEmailMatch("paras plays", {
      fromName: "Paras Plays",
      fromAddress: "paras@example.com",
      subject: "Catch up",
    })
    expect(score).toBeGreaterThan(90)
  })

  it("formats the selected email as readable chat content", () => {
    const answer = formatInboxEmailForChat({
      id: "email-1",
      fromName: "Paras",
      fromAddress: "paras@example.com",
      toAddress: "me@example.com",
      subject: "Weekend plan",
      body: "Are you free on Saturday?",
      receivedAt: new Date("2026-08-01T10:00:00.000Z"),
    })
    expect(answer).toContain("Weekend plan")
    expect(answer).toContain("Are you free on Saturday?")
  })

  it("keeps email headers but removes a displayed body from later AI history", () => {
    const displayed = formatInboxEmailForChat({
      id: "email-1",
      fromName: "Paras",
      fromAddress: "paras@example.com",
      toAddress: "me@example.com",
      subject: "Private plan",
      body: "Sensitive body text must stay out of the next model request.",
      receivedAt: new Date("2026-08-01T10:00:00.000Z"),
    })
    const compact = compactChatHistoryContent(displayed)
    expect(compact).toContain("Private plan")
    expect(compact).toContain("paras@example.com")
    expect(compact).not.toContain("Sensitive body text")
  })
})
