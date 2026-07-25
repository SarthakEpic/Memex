import { describe, expect, it } from "vitest"
import { extractTitle, slugify } from "./ingestion-utils"

describe("ingestion helpers", () => {
  it("extracts a markdown H1 as the note title", () => {
    expect(extractTitle("# System Design\n\nBody")).toBe("System Design")
  })

  it("falls back to the first line when no H1 exists", () => {
    expect(extractTitle("Decision: use Postgres\n\nBecause relational data matters.")).toBe(
      "Decision: use Postgres"
    )
  })

  it("creates stable URL-safe slugs", () => {
    expect(slugify("Memex: Citation-First RAG!")).toBe("memex-citation-first-rag")
  })

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("untitled")
  })
})
