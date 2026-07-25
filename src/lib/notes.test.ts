import { describe, expect, it } from "vitest"
import { bm25Score, chunkMarkdown, termFreq, tokenize, type IndexedChunk } from "./notes"

describe("notes retrieval primitives", () => {
  it("tokenizes text into stable lowercase terms", () => {
    expect(tokenize("Postgres, Redis & RAG!")).toEqual(["postgres", "redis", "rag"])
  })

  it("chunks markdown with heading paths", () => {
    const chunks = chunkMarkdown("# Architecture\n\n## Retrieval\n\nBM25 keeps local search simple.")

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({
      headingPath: "Architecture > Retrieval",
      chunkIndex: 0,
    })
  })

  it("ranks matching chunks above unrelated chunks", () => {
    const corpus: IndexedChunk[] = [
      {
        id: "a",
        noteId: "note-a",
        sourcePath: "/notes/a.md",
        headingPath: "A",
        chunkIndex: 0,
        text: "Postgres migration decisions and database pooling tradeoffs",
        termFreq: termFreq("Postgres migration decisions and database pooling tradeoffs"),
        tokens: 12,
      },
      {
        id: "b",
        noteId: "note-b",
        sourcePath: "/notes/b.md",
        headingPath: "B",
        chunkIndex: 0,
        text: "Frontend animation polish and layout ideas",
        termFreq: termFreq("Frontend animation polish and layout ideas"),
        tokens: 9,
      },
    ]

    const results = bm25Score("postgres database migration", corpus, 2)

    expect(results[0].id).toBe("a")
    expect(results[0].score).toBeGreaterThan(0)
  })
})
