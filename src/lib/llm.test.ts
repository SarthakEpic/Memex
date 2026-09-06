import { describe, expect, it } from "vitest"
import { buildReplyContext } from "./llm"

describe("reply email context", () => {
  it("keeps the opening and closing details of a long source email", () => {
    const source = "OPENING-DETAIL " + "x".repeat(10_000) + " CLOSING-DEADLINE"
    const compact = buildReplyContext(source, 1_000)
    expect(compact.length).toBeLessThan(1_100)
    expect(compact).toContain("OPENING-DETAIL")
    expect(compact).toContain("CLOSING-DEADLINE")
    expect(compact).toContain("middle of original email omitted")
  })
})