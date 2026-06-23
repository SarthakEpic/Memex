import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generateEmailBriefing } from "@/lib/llm"

// GET /api/inbox/briefing
// Generates a daily email briefing — a natural language summary of today's
// important emails that tells the user what needs attention.
export async function GET() {
  // Get today's emails (last 24 hours)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const emails = await db.inboxEmail.findMany({
    where: {
      receivedAt: { gte: since },
      isArchived: false,
    },
    orderBy: { receivedAt: "desc" },
    take: 30,
  })

  if (emails.length === 0) {
    return NextResponse.json({
      briefing: "📭 No emails received in the last 24 hours. You're all caught up!",
      stats: { total: 0, urgent: 0, important: 0, needReply: 0 },
    })
  }

  // Categorize
  const urgent = emails.filter((e) => e.category === "urgent")
  const important = emails.filter((e) => e.category === "important")
  const needReply = emails.filter((e) => e.action === "reply_needed")
  const newsletters = emails.filter((e) => e.category === "newsletter")
  const normal = emails.filter((e) => e.category === "normal")

  // Build a compact summary for the LLM
  const emailDigest = emails
    .map((e, i) => {
      return `[${i + 1}] Category: ${e.category} | From: ${e.fromName} (${e.fromAddress}) | Subject: ${e.subject} | Summary: ${e.summary || "N/A"} | Action: ${e.action}`
    })
    .join("\n")

  // Generate a natural language briefing via the AI provider
  const briefing = await generateEmailBriefing(
    emailDigest,
    emails.length,
    urgent.length,
    needReply.length,
    newsletters.length
  )

  return NextResponse.json({
    briefing: briefing.trim(),
    stats: {
      total: emails.length,
      urgent: urgent.length,
      important: important.length,
      needReply: needReply.length,
      newsletters: newsletters.length,
    },
  })
}
