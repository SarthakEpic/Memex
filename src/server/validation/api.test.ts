import { describe, expect, it } from "vitest"
import {
  chatRequestSchema,
  createNoteSchema,
  emailAccountCreateSchema,
  importUrlSchema,
  profileUpdateSchema,
  refreshInboxSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  uploadFileSchema,
} from "./api"

describe("API validation schemas", () => {
  it("accepts a valid note payload and defaults decision extraction", () => {
    const result = createNoteSchema.parse({ content: "# Note\n\nA useful decision." })

    expect(result.extractDecisions).toBe(true)
  })

  it("rejects non-http URL imports", () => {
    const result = importUrlSchema.safeParse({ url: "file:///etc/passwd" })

    expect(result.success).toBe(false)
  })

  it("caps chat prompt size", () => {
    const result = chatRequestSchema.safeParse({ message: "x".repeat(20_001) })

    expect(result.success).toBe(false)
  })

  it("treats a null chat session as a new conversation", () => {
    const result = chatRequestSchema.parse({ message: "Hello", sessionId: null })

    expect(result.sessionId).toBeUndefined()
  })

  it("requires valid email addresses for real account connection", () => {
    const result = emailAccountCreateSchema.safeParse({ emailAddress: "not-an-email" })

    expect(result.success).toBe(false)
  })

  it("requires exactly one inbox sync scope", () => {
    expect(refreshInboxSchema.parse({ scope: "period", range: "week" })).toEqual({
      scope: "period",
      range: "week",
    })
    expect(refreshInboxSchema.parse({ scope: "count", count: 100 })).toEqual({
      scope: "count",
      count: 100,
    })
    expect(refreshInboxSchema.safeParse({ scope: "period", range: "week", count: 25 }).success).toBe(false)
    expect(refreshInboxSchema.safeParse({ scope: "count", count: 30 }).success).toBe(false)
    expect(refreshInboxSchema.safeParse({ scope: "period", range: "all" }).success).toBe(false)
    expect(refreshInboxSchema.safeParse({}).success).toBe(false)
  })
  it("accepts only supported profile settings", () => {
    expect(profileUpdateSchema.safeParse({ name: "Aditi", digestHour: 8 }).success).toBe(true)
    expect(profileUpdateSchema.safeParse({ digestHour: 24 }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ smtpHost: "smtp.example.com" }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({}).success).toBe(false)
  })

  it("accepts upload payloads with safe defaults", () => {
    const result = uploadFileSchema.parse({
      fileName: "notes.md",
      fileBase64: Buffer.from("# Notes").toString("base64"),
    })

    expect(result.project).toBe("imported")
    expect(result.tags).toEqual([])
  })

  it("normalizes password reset request email addresses", () => {
    const result = requestPasswordResetSchema.safeParse({ email: " USER@Example.COM " })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("user@example.com")
    }
  })

  it("requires strong new passwords for reset completion", () => {
    const result = resetPasswordSchema.safeParse({
      token: "a".repeat(40),
      password: "short",
    })

    expect(result.success).toBe(false)
  })
})
