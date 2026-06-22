import { db } from "../src/lib/db"
import { extractDecisions } from "../src/lib/llm"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if (e?.message?.includes("429") || e?.message?.includes("Too many")) {
        await sleep(5000 * (i + 1))
        continue
      }
      return null
    }
  }
  return null
}

async function main() {
  const notes = await db.note.findMany({
    include: { chunks: { orderBy: { chunkIndex: "asc" } } },
  })
  // Skip notes that already have decisions
  let total = 0
  for (const note of notes) {
    const existing = await db.decision.count({ where: { noteId: note.id } })
    if (existing > 0) {
      console.log(`  ~ ${note.title}: already has ${existing}, skip`)
      continue
    }
    let count = 0
    for (const c of note.chunks) {
      const ds = await withRetry(() => extractDecisions(c.text, c.headingPath))
      if (!ds) {
        console.log(`  ! ${note.title} chunk ${c.chunkIndex} skipped (rate limit)`)
        await sleep(2000)
        continue
      }
      for (const d of ds) {
        await db.decision.create({
          data: {
            noteId: note.id,
            chunkId: c.id,
            title: d.title,
            decisionDate: d.decisionDate || "",
            rationale: d.rationale,
            alternatives: (d.alternatives || []).join("|"),
            outcome: d.outcome || "",
            participants: (d.participants || []).join("|"),
            project: note.project,
            confidence: d.confidence ?? 0.8,
          },
        })
        count++
        total++
      }
      await sleep(1500)
    }
    console.log(`  ✓ ${note.title}: ${count} decisions`)
  }
  console.log(`Total new decisions: ${total}`)
}
main().finally(() => db.$disconnect())
