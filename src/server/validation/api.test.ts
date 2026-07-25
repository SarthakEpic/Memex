import { describe, expect, it } from "vitest"
import {
  chatRequestSchema,
  createNoteSchema,
  emailAccountCreateSchema,
  importUrlSchema,
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

  it("requires valid email addresses for real account connection", () => {
    const result = emailAccountCreateSchema.safeParse({ emailAddress: "not-an-email" })

    expect(result.success).toBe(false)
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
