import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import ZAI from "z-ai-web-dev-sdk"

let zaiPromise: Promise<ZAI> | null = null
function getClient(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create()
  return zaiPromise
}

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

  // Generate a natural language briefing
  const zai = await getClient()
  let briefing = ""
  try {
    const result = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are Memex's daily email briefing assistant. Write a concise, friendly briefing of today's emails. Structure it as:

## 📬 Today's Email Briefing

**Quick stats:** X urgent, Y need replies, Z newsletters

### 🔴 Needs Immediate Attention
(List urgent + reply_needed emails with what to do)

### 🟡 Important (review when you have time)
(List important emails briefly)

### 📰 FYI / Newsletter
(One line summary of newsletters)

### ✅ You can skip
(normal/spam emails — just count them)

Keep it under 200 words total. Be specific about what action each urgent email needs. Use Markdown formatting. Be friendly but concise.`,
        },
        {
          role: "user",
          content: `Today's emails (${emails.length} total):\n\n${emailDigest}\n\nWrite the briefing:`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    })
    if (typeof result === "string") briefing = result
    else if (result?.choices?.[0]?.message?.content) briefing = result.choices[0].message.content
    else briefing = String(result ?? "")
  } catch {
    // Fallback: generate a basic briefing without LLM
    briefing = `## 📬 Today's Email Briefing\n\n**Quick stats:** ${urgent.length} urgent, ${needReply.length} need replies, ${newsletters.length} newsletters\n\n`
    if (urgent.length > 0) {
      briefing += `### 🔴 Needs Immediate Attention\n`
      urgent.forEach((e) => {
        briefing += `- **${e.fromName}**: ${e.subject} — ${e.summary}\n`
      })
    }
    if (important.length > 0) {
      briefing += `\n### 🟡 Important\n`
      important.forEach((e) => {
        briefing += `- **${e.fromName}**: ${e.subject}\n`
      })
    }
    briefing += `\n### 📰 Newsletters: ${newsletters.length}\n`
    briefing += `### ✅ Normal/FYI: ${normal.length}\n`
  }

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
