import { describe, expect, it } from "vitest"
import { selectRelevantText } from "./relevant-text"

describe("selectRelevantText", () => {
  it("preserves a relevant deadline from the middle of a long message", () => {
    const source = `Opening context.\n\n${"Routine update. ".repeat(100)}\n\nPlease approve the contract by Friday at 5:00.\n\n${"Quoted history. ".repeat(100)}\n\nClosing note.`
    const selected = selectRelevantText(source, "when do I need to approve the contract", 600)
    expect(selected.omitted).toBe(true)
    expect(selected.text).toContain("approve the contract by Friday at 5:00")
    expect(selected.text.length).toBeLessThanOrEqual(600)
  })

  it("returns short text unchanged", () => {
    expect(selectRelevantText("Short message", "summary").text).toBe("Short message")
  })
})
