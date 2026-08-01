import { describe, expect, it } from "vitest"
import { markdownToHtml } from "./markdown"

describe("markdownToHtml", () => {
  it("escapes raw HTML in message bodies", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)">')

    expect(html).toContain("&lt;img")
    expect(html).not.toContain("<img")
  })

  it("blocks unsafe link protocols", () => {
    const html = markdownToHtml("[open](javascript:alert(1))")

    expect(html).toContain('href="#"')
    expect(html).not.toContain('href="javascript:')
  })

  it("keeps safe web links isolated from the application window", () => {
    const html = markdownToHtml("[docs](https://example.com/path)")

    expect(html).toContain('href="https://example.com/path"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
