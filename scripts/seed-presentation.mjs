import { createHash } from "node:crypto"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const email = process.env.MEMEX_PRESENTATION_EMAIL ?? process.argv.find((value) => value.startsWith("--email="))?.slice(8)

if (!email) {
  console.error('Usage: $env:MEMEX_PRESENTATION_EMAIL="you@example.com"; npm run db:seed-presentation')
  process.exit(1)
}

const user = await db.user.findUnique({ where: { email } })
if (!user) {
  console.error(`No local user exists for ${email}. Sign in once, then retry.`)
  process.exit(1)
}

const now = new Date()
const hoursAgo = (hours) => new Date(now.getTime() - hours * 3_600_000)
const notes = [
  ["q3-launch-plan", "Q3 Product Launch Plan", "demo,launch,planning", true, `# Q3 Product Launch Plan

## Goal
Launch the new team workspace to the first 500 invited customers by 30 September.

## Milestones
- 8 Sep: finish accessibility review and production monitoring.
- 15 Sep: begin internal dogfooding with Support and Sales.
- 22 Sep: invite the first 100 design partners.
- 30 Sep: expand the staged rollout if activation stays above 45%.

## Success measures
- 45% of invited teams create a workspace in the first week.
- Fewer than 2% of sessions create an onboarding support ticket.
- Median first-response time stays under 30 minutes.

## Risks
The main risks are email-delivery trust, confusing onboarding, and an overloaded support queue during the first invitation wave.`],
  ["customer-research", "Customer Research Summary", "demo,research,customer", false, `# Customer Research Summary

## What teams asked for
Customers want one calm place to turn fragmented email, notes, and decisions into clear next actions. They value speed, citations, and the ability to check an answer before sharing it.

## Evidence
- 8 of 10 interviews described missed follow-ups as their biggest daily frustration.
- Operations teams preferred a small number of high-confidence alerts over a noisy priority score.
- Users want AI to draft, not silently act. Every outward email must remain human-confirmed.

## Implication
The first release should focus on dependable inbox review, source-backed answers, and explicit email confirmation rather than broad automation.`],
  ["release-readiness", "Release Readiness Review", "demo,engineering,release", false, `# Release Readiness Review

## Ready
- Authenticated API smoke coverage is passing.
- Email drafts require human confirmation before sending.
- AI work is budgeted so background inbox analysis cannot consume interactive capacity.

## Before external launch
- Configure production PostgreSQL and backup access controls.
- Register verified Google OAuth credentials for the production domain.
- Set monitoring for provider quota errors and failed email delivery.

## Recommendation
Proceed with an internal rollout first. Expand only after the support owner confirms onboarding and inbox review flows.`],
]

const stored = new Map()
for (const [slug, title, tags, pinned, content] of notes) {
  const sourcePath = `/demo/${slug}.md`
  const contentHash = createHash("sha256").update(content).digest("hex")
  const note = await db.note.upsert({
    where: { userId_sourcePath: { userId: user.id, sourcePath } },
    create: { userId: user.id, title: `Demo: ${title}`, content, sourcePath, project: "Q3 Launch", tags, contentHash, chunkCount: 1, pinned },
    update: { title: `Demo: ${title}`, content, project: "Q3 Launch", tags, contentHash, chunkCount: 1, pinned },
  })
  await db.decision.deleteMany({ where: { userId: user.id, noteId: note.id } })
  await db.chunk.deleteMany({ where: { userId: user.id, noteId: note.id } })
  const chunk = await db.chunk.create({
    data: { userId: user.id, noteId: note.id, chunkIndex: 0, text: content, headingPath: title, tokens: Math.ceil(content.length / 4), termFreq: JSON.stringify(termFrequency(content)) },
  })
  stored.set(slug, { note, chunk })
}

const decisions = [
  ["staged-rollout", "q3-launch-plan", "Use a staged customer rollout", "A staged rollout limits support risk while providing real activation evidence before a wider launch.", "Launch to all invitees at once|Delay all customer access", "Invite 100 design partners first, then expand after activation and support thresholds are met.", "Product|Engineering|Support", 0.94],
  ["human-confirmation", "customer-research", "Keep human confirmation for outgoing email", "Research participants trusted drafting assistance but did not want automation to send an external message without review.", "Fully automated email actions|Disable drafting assistance", "Drafting stays assisted; sending always requires explicit confirmation.", "Product|Research", 0.98],
]

for (const [key, slug, title, rationale, alternatives, outcome, participants, confidence] of decisions) {
  const source = stored.get(slug)
  await db.decision.create({
    data: { id: `demo-${key}`, userId: user.id, noteId: source.note.id, chunkId: source.chunk.id, title, decisionDate: now.toISOString().slice(0, 10), rationale, alternatives, outcome, participants, project: "Q3 Launch", confidence, pinned: key === "staged-rollout" },
  })
}

const inbox = [
  ["launch-approval", "Ava Patel", "ava@northstar.example", "Approval needed: design partner launch copy", "urgent", "reply_needed", 96, 2, "Marketing needs approval on the design-partner invite copy before noon today."],
  ["security", "Ravi Shah", "ravi@secureworks.example", "Action required: production access review", "important", "review", 84, 5, "Security requested confirmation that production access owners are current before launch."],
  ["customer", "Maya Chen", "maya@northstar.example", "Feedback from the onboarding pilot", "important", "reply_needed", 78, 9, "The pilot team completed setup quickly but asked for clearer inbox sync progress."],
  ["contract", "Legal Operations", "legal@acme.example", "Demo: data processing addendum ready for review", "normal", "review", 58, 18, "The latest data-processing addendum is ready for product review."],
  ["newsletter", "Product Brief", "newsletter@productbrief.example", "Weekly product signals", "newsletter", "archive", 12, 28, "A weekly collection of product and market updates."],
  ["receipt", "Cloud Metrics", "billing@cloudmetrics.example", "Receipt for August workspace usage", "normal", "archive", 24, 34, "Your August usage receipt is available for records."],
  ["team", "Jordan Lee", "jordan@memex-demo.example", "Team: support coverage for launch week", "important", "reply_needed", 81, 40, "Jordan proposed a support rotation and needs confirmation by tomorrow."],
]

for (const [key, fromName, fromAddress, subject, category, action, triageScore, ageHours, summary] of inbox) {
  const id = `demo-inbox-${key}`
  await db.inboxEmail.upsert({
    where: { id },
    create: {
      id, userId: user.id, fromName, fromAddress, toAddress: user.email, subject,
      body: `${summary}\n\nThis is presentation-only demo content stored locally. It is not a real email.`,
      category, action, summary, keyPoints: JSON.stringify([summary, "Presentation demo data only"]),
      analyzed: true, analysisState: "analyzed", triageScore, isRead: ["newsletter", "receipt"].includes(key), isStarred: key === "launch-approval", receivedAt: hoursAgo(ageHours), providerMessageId: id,
    },
    update: { fromName, fromAddress, subject, category, action, summary, triageScore, analyzed: true, analysisState: "analyzed", receivedAt: hoursAgo(ageHours) },
  })
}

await db.email.upsert({
  where: { id: "demo-saved-launch-draft" },
  create: {
    id: "demo-saved-launch-draft", userId: user.id, toAddress: "design-partners@example.com", fromName: "Memex Demo", subject: "Demo: Design partner launch update",
    bodyMarkdown: "Hello team,\n\nThis is a presentation-only saved draft. It cannot send because no email account is selected.\n\nBest,\nMemex Demo",
    status: "saved", sourceType: "manual", deliveryMode: "local", errorMessage: "Presentation demo draft - no delivery attempted.",
  },
  update: { status: "saved", deliveryMode: "local", errorMessage: "Presentation demo draft - no delivery attempted." },
})

const session = await db.chatSession.upsert({ where: { id: "demo-launch-readiness-chat" }, create: { id: "demo-launch-readiness-chat", userId: user.id, title: "Demo: Launch readiness review" }, update: { title: "Demo: Launch readiness review" } })
await db.chatMessage.deleteMany({ where: { userId: user.id, sessionId: session.id } })
const readiness = stored.get("release-readiness")
await db.chatMessage.createMany({
  data: [
    { userId: user.id, sessionId: session.id, role: "user", content: "What should we complete before the Q3 launch?" },
    { userId: user.id, sessionId: session.id, role: "assistant", content: "Before external launch, configure production PostgreSQL, complete Google OAuth production setup, and monitor quota and email-delivery failures. The recommended rollout is internal first, then 100 design partners. [^demo-release-readiness]", citations: JSON.stringify([{ chunkId: readiness.chunk.id, noteId: readiness.note.id, sourcePath: "/demo/release-readiness.md", chunkIndex: 0, snippet: "Before external launch", score: 0.98 }]) },
  ],
})

console.log("Seeded presentation data: 3 notes, 2 decisions, 7 inbox emails, 1 saved draft, and 1 chat session.")
await db.$disconnect()

function termFrequency(text) {
  const frequency = {}
  for (const term of text.toLowerCase().match(/[a-z0-9]{2,}/g) || []) frequency[term] = (frequency[term] || 0) + 1
  return frequency
}


