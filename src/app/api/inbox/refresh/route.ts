import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { analyzeEmail } from "@/lib/llm"

// POST /api/inbox/refresh
// Simulates fetching new emails from a connected IMAP account.
// In a real deployment, this would connect via IMAP and fetch unread messages.
// Here we generate realistic sample emails + run AI analysis on them.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { count = 5 } = body as { count?: number }

  // Check if an email account is connected
  const account = await db.emailAccount.findFirst({
    where: { connected: true },
  })

  // Sample email templates for realistic simulation
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
      body: "Tech Weekly Digest — Issue #247\n\nTop stories this week:\n1. Meta releases Llama 3.2 with vision capabilities\n2. Qdrant vs Weaviate: 2024 benchmark results\n3. The rise of local-first AI tools\n4. Why RAG is eating fine-tuning's lunch\n\nRead more at techweekly.com/issue-247\n\nYou're receiving this because you subscribed. Unsubscribe below.",
    },
    {
      from: "billing@aws.com",
      name: "AWS Billing",
      subject: "Your AWS bill for May 2026 is ready — $847.32",
      body: "Dear Customer,\n\nYour AWS bill for the billing period May 2026 is now available.\n\nTotal charges: $847.32\nDue date: June 15, 2026\n\nBreakdown:\n- EC2: $412.00\n- RDS: $234.50\n- S3: $89.20\n- CloudWatch: $45.00\n- Other: $66.62\n\nView detailed invoice at aws.amazon.com/billing\n\nThank you for being an AWS customer.",
    },
    {
      from: "mike@startup-hub.com",
      name: "Mike Rodriguez",
      subject: "Re: Architecture review — thoughts on the new caching layer?",
      body: "Hey,\n\nI read through your caching strategy doc and I think the Redis 7 + RQ approach is solid. A few questions:\n\n1. Have you considered Valkey as a Redis alternative given the license change?\n2. What's your eviction strategy for the result cache? TTL-only feels risky for hot queries.\n3. Are you warming the cache on deploy or lazy-loading?\n\nHappy to jump on a call to discuss. I've got some war stories from our last caching migration that might save you some headaches.\n\nMike",
    },
    {
      from: "no-reply@linkedin.com",
      name: "LinkedIn",
      subject: "You appeared in 3 searches this week — see who looked at your profile",
      body: "Hi,\n\nYou appeared in 3 searches this week. People at these companies searched for someone like you:\n\n- Google (Senior Engineer role)\n- Stripe (Staff Engineer role)\n- Vercel (Developer Advocate role)\n\nSee who viewed your profile: linkedin.com/profile-views\n\nUpdate your profile to appear in more searches.",
    },
    {
      from: "legal@vendor-partner.com",
      name: "Legal Team",
      subject: "ACTION REQUIRED: Updated Data Processing Agreement — signature needed by June 30",
      body: "Dear Customer,\n\nPer our records, your Data Processing Agreement (DPA) with Vendor Partner Inc. needs to be renewed.\n\nThe updated agreement includes:\n- Revised data retention terms (90 days max)\n- New sub-processor list (3 additions)\n- Updated breach notification window (72 hours)\n\nPlease review and sign by June 30, 2026 to ensure continuous service.\n\nAttachment: DPA_2026_v3.pdf\n\nThis is a legally binding document. Please review carefully.",
    },
    {
      from: "team@standup-bot.com",
      name: "Standup Bot",
      subject: "Daily standup summary — 3 blockers reported",
      body: "Here's today's standup summary:\n\n✅ Completed yesterday:\n- Fixed chat retry logic for 429 errors\n- Merged PR #140 (note tags filter)\n- Deployed analytics export feature\n\n🔄 In progress today:\n- Email inbox management feature\n- Security settings panel\n- Onboarding tour\n\n🚫 Blockers:\n- @sarah: Waiting on DB migration approval\n- @mike: CI failing on Python 3.12 tests\n- @alex: Need design review for new dashboard\n\nView full standup: standup-bot.com/s/abc123",
    },
  ]

  // Pick `count` random templates
  const selected = [...templates]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, templates.length))

  let added = 0
  for (const tpl of selected) {
    // Run AI analysis
    const analysis = await analyzeEmail(tpl.from, tpl.subject, tpl.body)

    const email = await db.inboxEmail.create({
      data: {
        accountId: account?.id ?? "",
        fromAddress: tpl.from,
        fromName: tpl.name,
        toAddress: account?.emailAddress ?? "you@memex.local",
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
    if (email) added++
  }

  // Update lastSyncAt on the account
  if (account) {
    await db.emailAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    })
  }

  return NextResponse.json({
    added,
    message: `Synced ${added} new email${added !== 1 ? "s" : ""} with AI analysis.`,
  })
}
