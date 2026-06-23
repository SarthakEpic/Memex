import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { analyzeEmail } from "@/lib/llm"

// POST /api/inbox/refresh
// Syncs emails from connected account.
// If account has real IMAP credentials (syncMode="real") → connect via IMAP
// If account is demo mode (syncMode="demo") → generate realistic sample emails
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { count = 5 } = body as { count?: number }

  const account = await db.emailAccount.findFirst({
    where: { connected: true },
  })

  if (!account) {
    return NextResponse.json({ error: "No connected email account" }, { status: 400 })
  }

  let added = 0
  let syncMode = account.syncMode || "demo"

  // Try real IMAP if credentials are available
  if (account.imapPassword && account.imapHost) {
    try {
      added = await syncRealImap(account, count)
      syncMode = "real"
    } catch (err: any) {
      console.error("IMAP sync failed, falling back to demo:", err.message)
      // Fall back to demo mode
      added = await syncDemoEmails(account, count)
      syncMode = "demo"
    }
  } else {
    // Demo mode — no real credentials
    added = await syncDemoEmails(account, count)
  }

  await db.emailAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date(), syncMode },
  })

  return NextResponse.json({
    added,
    syncMode,
    message: syncMode === "real"
      ? `Synced ${added} new email${added !== 1 ? "s" : ""} from your real inbox.`
      : `Synced ${added} demo email${added !== 1 ? "s" : ""} (demo mode — add IMAP password for real sync).`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Real IMAP sync using imapflow
// ─────────────────────────────────────────────────────────────────────────────
async function syncRealImap(account: any, maxCount: number): Promise<number> {
  const { ImapFlow } = await import("imapflow")

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.imapUser || account.emailAddress,
      pass: account.imapPassword,
    },
    logger: false,
  })

  await client.connect()

  // Open INBOX
  const lock = await client.getMailboxLock("INBOX")
  let added = 0

  try {
    // Get recent unread messages
    const searchResult = await client.search({ seen: false })
    const recentIds = searchResult.slice(-maxCount) // Get last N unread

    for (const msgId of recentIds) {
      const msg = await client.fetchOne(msgId, {
        envelope: true,
        source: true,
        bodyStructure: true,
      })

      if (!msg || !msg.envelope) continue

      const from = msg.envelope.from?.[0]
      const fromAddress = from ? `${from.address}` : "unknown@unknown.com"
      const fromName = from ? `${from.name || from.address}` : "Unknown"
      const subject = msg.envelope.subject || "(no subject)"
      const receivedAt = msg.envelope.date ? new Date(msg.envelope.date) : new Date()

      // Extract plain text body from the email source
      const rawSource = msg.source?.toString("utf-8") || ""
      const body = extractPlainText(rawSource)

      if (!body.trim() || body.trim().length < 10) continue

      // Check if we already have this email (by subject + from + date)
      const existing = await db.inboxEmail.findFirst({
        where: {
          fromAddress,
          subject,
          receivedAt,
        },
      })
      if (existing) continue

      // Run AI analysis
      const analysis = await analyzeEmail(fromAddress, subject, body)

      await db.inboxEmail.create({
        data: {
          accountId: account.id,
          fromAddress,
          fromName,
          toAddress: account.emailAddress,
          subject,
          body,
          category: analysis?.category ?? "normal",
          action: analysis?.action ?? "review",
          summary: analysis?.summary ?? "",
          keyPoints: JSON.stringify(analysis?.keyPoints ?? []),
          suggestedReply: analysis?.suggestedReply ?? "",
          analyzed: !!analysis,
          threadId: subject.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40),
          receivedAt,
        },
      })
      added++
    }
  } finally {
    lock.release()
    await client.logout()
  }

  return added
}

// Extract plain text from raw email source
function extractPlainText(raw: string): string {
  // Try to find text/plain part
  const textPartMatch = raw.match(/Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i)
  if (textPartMatch) {
    let text = textPartMatch[1]
    // Remove quoted-printable encoding
    text = text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    return text.trim()
  }

  // Fallback: strip HTML tags
  const htmlPartMatch = raw.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i)
  if (htmlPartMatch) {
    return htmlPartMatch[1]
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  // Last resort: return first 500 chars of source
  return raw.slice(0, 500).replace(/<[^>]*>/g, " ").trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo mode — generate realistic sample emails with AI analysis
// ─────────────────────────────────────────────────────────────────────────────
async function syncDemoEmails(account: any, count: number): Promise<number> {
  const templates = [
    {
      from: "sarah@acme-corp.com",
      name: "Sarah Chen",
      subject: "URGENT: Production database migration delayed — need your input by 5pm",
      body: "Hi team,\n\nThe Postgres 16 migration is behind schedule. We hit an issue with the connection pooler config and I need your decision on whether to proceed tonight or push to next week.\n\nThe risk of waiting: the current DB has 2 weeks of headroom left.\nThe risk of proceeding: possible 30min downtime during the cutover.\n\nCan you review the migration runbook I shared yesterday and reply by 5pm today? This is time-critical.\n\nThanks,\nSarah",
    },
    {
      from: "notifications@github.com",
      name: "GitHub",
      subject: "[memex/memex] PR #142: Add email scheduling feature — review requested",
      body: "A new pull request has been opened by @dev-bot.\n\nPR #142: Add email scheduling feature\n\nChanges:\n- New scheduledFor field on Email model\n- Scheduler tick in digest endpoint\n- UI for datetime picker\n\n2 files changed, 156 insertions, 12 deletions.\n\nPlease review at: https://github.com/memex/memex/pull/142",
    },
    {
      from: "newsletter@techweekly.com",
      name: "Tech Weekly",
      subject: "🚀 This week in AI: Llama 3.2 released, vector DB benchmarks, and more",
      body: "Tech Weekly Digest — Issue #247\n\nTop stories this week:\n1. Meta releases Llama 3.2 with vision capabilities\n2. Qdrant vs Weaviate: 2024 benchmark results\n3. The rise of local-first AI tools\n4. Why RAG is eating fine-tuning's lunch\n\nRead more at techweekly.com/issue-247",
    },
    {
      from: "billing@aws.com",
      name: "AWS Billing",
      subject: "Your AWS bill for May 2026 is ready — $847.32",
      body: "Dear Customer,\n\nYour AWS bill for the billing period May 2026 is now available.\n\nTotal charges: $847.32\nDue date: June 15, 2026\n\nBreakdown:\n- EC2: $412.00\n- RDS: $234.50\n- S3: $89.20\n- CloudWatch: $45.00\n- Other: $66.62",
    },
    {
      from: "mike@startup-hub.com",
      name: "Mike Rodriguez",
      subject: "Re: Architecture review — thoughts on the new caching layer?",
      body: "Hey,\n\nI read through your caching strategy doc and I think the Redis 7 + RQ approach is solid. A few questions:\n\n1. Have you considered Valkey as a Redis alternative?\n2. What's your eviction strategy for the result cache?\n3. Are you warming the cache on deploy or lazy-loading?\n\nHappy to jump on a call. Mike",
    },
    {
      from: "no-reply@linkedin.com",
      name: "LinkedIn",
      subject: "You appeared in 3 searches this week — see who looked at your profile",
      body: "Hi,\n\nYou appeared in 3 searches this week. People at these companies searched for someone like you:\n\n- Google (Senior Engineer role)\n- Stripe (Staff Engineer role)\n- Vercel (Developer Advocate role)",
    },
    {
      from: "legal@vendor-partner.com",
      name: "Legal Team",
      subject: "ACTION REQUIRED: Updated Data Processing Agreement — signature needed by June 30",
      body: "Dear Customer,\n\nPer our records, your Data Processing Agreement (DPA) needs to be renewed.\n\nThe updated agreement includes:\n- Revised data retention terms (90 days max)\n- New sub-processor list (3 additions)\n- Updated breach notification window (72 hours)\n\nPlease review and sign by June 30, 2026.",
    },
    {
      from: "team@standup-bot.com",
      name: "Standup Bot",
      subject: "Daily standup summary — 3 blockers reported",
      body: "Here's today's standup summary:\n\n✅ Completed yesterday:\n- Fixed chat retry logic\n- Merged PR #140\n\n🔄 In progress today:\n- Email inbox management\n- Security settings\n\n🚫 Blockers:\n- Waiting on DB migration approval\n- CI failing on Python tests",
    },
  ]

  const selected = [...templates].sort(() => Math.random() - 0.5).slice(0, Math.min(count, templates.length))
  let added = 0

  for (const tpl of selected) {
    // Check if already exists
    const existing = await db.inboxEmail.findFirst({
      where: { fromAddress: tpl.from, subject: tpl.subject },
    })
    if (existing) continue

    const analysis = await analyzeEmail(tpl.from, tpl.subject, tpl.body)

    await db.inboxEmail.create({
      data: {
        accountId: account.id,
        fromAddress: tpl.from,
        fromName: tpl.name,
        toAddress: account.emailAddress,
        subject: tpl.subject,
        body: tpl.body,
        category: analysis?.category ?? "normal",
        action: analysis?.action ?? "review",
        summary: analysis?.summary ?? "",
        keyPoints: JSON.stringify(analysis?.keyPoints ?? []),
        suggestedReply: analysis?.suggestedReply ?? "",
        analyzed: !!analysis,
        threadId: tpl.subject.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40),
        receivedAt: new Date(Date.now() - Math.random() * 3600000),
      },
    })
    added++
  }

  return added
}
