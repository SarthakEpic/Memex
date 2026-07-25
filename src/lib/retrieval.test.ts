import { afterEach, describe, expect, it, vi } from "vitest"
import { termFreq } from "./notes"

describe("retrieval user isolation", () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("never returns another user's chunks for the same query", async () => {
    const rows = [
      {
        id: "chunk-a",
        userId: "user-a",
        noteId: "note-a",
        text: "private launch plan alpha",
        headingPath: "Plan",
        chunkIndex: 0,
        tokens: 8,
        termFreq: JSON.stringify(termFreq("private launch plan alpha")),
        note: { sourcePath: "/notes/a.md" },
      },
      {
        id: "chunk-b",
        userId: "user-b",
        noteId: "note-b",
        text: "private launch plan beta",
        headingPath: "Plan",
        chunkIndex: 0,
        tokens: 8,
        termFreq: JSON.stringify(termFreq("private launch plan beta")),
        note: { sourcePath: "/notes/b.md" },
      },
    ]

    const findMany = vi.fn(async ({ where }: { where: { userId: string } }) =>
      rows.filter((row) => row.userId === where.userId)
    )

    vi.doMock("@/lib/db", () => ({
      db: {
        chunk: { findMany },
        note: { count: vi.fn() },
      },
    }))
    vi.doMock("@/lib/llm", () => ({
      llmRerank: vi.fn(),
    }))

    const { retrieve } = await import("./retrieval")
    const [userAResults, userBResults] = await Promise.all([
      retrieve("private launch plan", { userId: "user-a", topK: 5 }),
      retrieve("private launch plan", { userId: "user-b", topK: 5 }),
    ])

    expect(userAResults.map((chunk) => chunk.id)).toEqual(["chunk-a"])
    expect(userBResults.map((chunk) => chunk.id)).toEqual(["chunk-b"])
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-a" },
      include: { note: true },
    })
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-b" },
      include: { note: true },
    })
  })
})
