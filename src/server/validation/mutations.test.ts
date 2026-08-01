import { describe, expect, it } from "vitest"
import {
  audioNoteSchema,
  chatMessageDraftUpdateSchema,
  emailRegenerateSchema,
  eraseWorkspaceSchema,
  inboxUpdateSchema,
  noteBulkMutationSchema,
  noteUpdateSchema,
} from "./mutations"

describe("mutation validation schemas", () => {
  it("rejects empty and oversized note updates", () => {
    expect(noteUpdateSchema.safeParse({}).success).toBe(false)
    expect(noteUpdateSchema.safeParse({ title: "Updated" }).success).toBe(true)
    expect(noteUpdateSchema.safeParse({ content: "x".repeat(2_000_001) }).success).toBe(false)
  })

  it("caps bulk note operations and inbox categories", () => {
    expect(noteBulkMutationSchema.safeParse({ action: "delete", ids: ["a"] }).success).toBe(true)
    expect(noteBulkMutationSchema.safeParse({ action: "delete", ids: Array(101).fill("a") }).success).toBe(false)
    expect(inboxUpdateSchema.safeParse({ category: "malware" }).success).toBe(false)
  })

  it("requires the exact workspace erase phrase", () => {
    expect(eraseWorkspaceSchema.safeParse({ confirm: "ERASE ALL DATA" }).success).toBe(true)
    expect(eraseWorkspaceSchema.safeParse({ confirm: "erase" }).success).toBe(false)
  })

  it("validates persisted email drafts and regeneration input", () => {
    const core = {
      recipient: "person@example.com",
      subject: "Follow up",
      bodyMarkdown: "Hello",
      rationale: "Requested by user",
    }
    expect(
      chatMessageDraftUpdateSchema.safeParse({
        emailDraft: {
          ...core,
          status: "draft",
          timeline: [{ action: "Created", timestamp: new Date().toISOString() }],
        },
      }).success
    ).toBe(true)
    expect(
      emailRegenerateSchema.safeParse({
        instruction: "Write a follow up",
        previousDraft: core,
        feedback: "Shorter",
      }).success
    ).toBe(true)
  })

  it("caps audio payload size and language values", () => {
    expect(audioNoteSchema.safeParse({ audio: "abc", language: "hi" }).success).toBe(true)
    expect(audioNoteSchema.safeParse({ audio: "abc", language: "fr" }).success).toBe(false)
  })
})
