import { db } from "@/lib/db"
import { analyzeEmail } from "@/lib/llm"

const ANALYSIS_CONCURRENCY = 3

export async function analyzeInboxEmails(userId: string, emailIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(emailIds)).slice(0, 100)

  for (let index = 0; index < uniqueIds.length; index += ANALYSIS_CONCURRENCY) {
    const batch = uniqueIds.slice(index, index + ANALYSIS_CONCURRENCY)
    await Promise.allSettled(
      batch.map(async (id) => {
        const email = await db.inboxEmail.findFirst({
          where: { id, userId, analyzed: false },
          select: { id: true, fromAddress: true, subject: true, body: true },
        })
        if (!email) return

        const analysis = await analyzeEmail(email.fromAddress, email.subject, email.body)
        if (!analysis) return

        await db.inboxEmail.updateMany({
          where: { id: email.id, userId, analyzed: false },
          data: {
            category: analysis.category ?? "normal",
            action: analysis.action ?? "review",
            summary: analysis.summary ?? "",
            keyPoints: JSON.stringify(analysis.keyPoints ?? []),
            suggestedReply: analysis.suggestedReply ?? "",
            analyzed: true,
          },
        })
      })
    )
  }
}
