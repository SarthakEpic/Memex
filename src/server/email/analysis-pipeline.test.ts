import { describe, expect, it } from "vitest"
import { classifyInboxEmailLocally } from "./analysis-pipeline"
import { rankInboxCandidates } from "./review-inbox"

describe("email intelligence pipeline", () => {
  it("classifies obvious automated newsletters locally without spending an AI request", () => {
    expect(classifyInboxEmailLocally({
      fromAddress: "newsletter@updates.example.com",
      fromName: "Newsletter",
      subject: "Weekly product newsletter",
      isRead: false,
      isStarred: false,
    })).toMatchObject({
      category: "newsletter",
      action: "archive",
      final: true,
    })
  })

  it("prioritizes unread urgent subject matches before unrelated newsletter metadata", () => {
    const now = new Date()
    const candidates = rankInboxCandidates("check my urgent emails", [
      {
        id: "newsletter",
        fromAddress: "news@example.com",
        fromName: "News",
        subject: "Monthly newsletter",
        category: "newsletter",
        summary: "",
        analyzed: true,
        analysisState: "local",
        triageScore: 0,
        isRead: false,
        isStarred: false,
        receivedAt: now,
      },
      {
        id: "deadline",
        fromAddress: "manager@example.com",
        fromName: "Manager",
        subject: "Urgent: approval needed today",
        category: "normal",
        summary: "",
        analyzed: false,
        analysisState: "queued",
        triageScore: 72,
        isRead: false,
        isStarred: true,
        receivedAt: now,
      },
    ])

    expect(candidates[0]?.id).toBe("deadline")
  })
})
