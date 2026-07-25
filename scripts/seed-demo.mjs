import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto"
import { promisify } from "node:util"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const seededSources = new Map()
const scrypt = promisify(scryptCallback)

const DEMO_USER_ID = "demo-user"
const DEMO_EMAIL = "you@memex.local"
const DEMO_PASSWORD = "memex-demo-password"

const NOTES = [
  {
    title: "Database Selection",
    project: "core",
    tags: ["decision", "database", "postgres"],
    decision: {
      title: "Use Postgres as the primary database",
      decisionDate: "2026-03-14",
      rationale: "ACID guarantees, JSONB, full-text search, and transactional integrity mattered more than MongoDB flexibility.",
      alternatives: "MongoDB|SQLite",
      outcome: "Postgres became the production database while SQLite stayed as the local development option.",
      participants: "Aditi|Platform team",
    },
    content: `# Database Selection

## Postgres vs Mongo

We picked Postgres because ACID guarantees matter for financial and workflow data. Mongo's document model was tempting, but losing transaction confidence across collections was not worth it.

Postgres 16 also gives us JSONB, full-text search, recursive CTEs, and reliable backups. That is enough to avoid adding a separate search engine at this stage.

Decided 2026-03-14: Postgres for production, SQLite for local development and portfolio demos.

## Local development

SQLite stays valuable because it makes onboarding fast. A reviewer can clone the project, initialize a local database, seed it, and run the app without a cloud account.

## Backup posture

Production should use a managed Postgres provider with point-in-time recovery enabled. Local SQLite is intentionally excluded from git because it can contain private notes and email metadata.`,
  },
  {
    title: "Citation-First RAG Contract",
    project: "ai",
    tags: ["decision", "rag", "citations"],
    decision: {
      title: "Require citations for note-grounded answers",
      decisionDate: "2026-04-02",
      rationale: "A personal knowledge assistant is only useful if users can audit claims back to exact source chunks.",
      alternatives: "Freeform chat answers|Vector-only semantic search",
      outcome: "Chat answers cite chunk IDs and refuse when the corpus does not support the answer.",
      participants: "Aditi|AI reviewer",
    },
    content: `# Citation-First RAG Contract

## Trust rule

Memex answers note questions with citations. If the answer cannot be supported by the notes, the assistant should say it does not have a source instead of inventing.

## Retrieval approach

BM25 keyword retrieval is the default because it is cheap, explainable, and local-first. Term frequencies are precomputed per chunk, which makes search fast without a vector database.

## Why not embeddings first

Embeddings are useful later, but they add cost, external calls, and another moving part. For a portfolio project, a reliable citation pipeline is more impressive than a fragile vector demo.

## Evaluation

Useful review questions:

- Can every citation open the original source chunk?
- Does the assistant refuse unsupported claims?
- Does the app still answer basic questions if the AI provider is rate-limited?`,
  },
  {
    title: "Email Workflow Safety",
    project: "email",
    tags: ["decision", "email", "verification"],
    decision: {
      title: "Keep human verification in the email pipeline",
      decisionDate: "2026-05-08",
      rationale: "AI can draft helpful messages, but sending email should remain a user-confirmed action.",
      alternatives: "Auto-send AI drafts|Disable AI email drafting",
      outcome: "AI drafts become editable cards with verification, scheduling, retry, and cancel states.",
      participants: "Aditi|Product review",
    },
    content: `# Email Workflow Safety

## Drafting

When the user asks Memex to send an email, the assistant creates a structured draft with recipient, subject, body, rationale, and timeline state.

## Verification

AI-generated email can be marked as pending verification before delivery. The user can edit the content, regenerate with feedback, schedule it, or cancel it.

## Credential handling

Real IMAP and SMTP app passwords are encrypted before storage. The demo mode stays available so reviewers can evaluate the inbox workflow without connecting a real account.

## Production expectation

For hosted deployment, access control should be enabled and real credentials should only be used with a long production encryption key.`,
  },
  {
    title: "Production Hardening Plan",
    project: "platform",
    tags: ["security", "operations", "production"],
    decision: {
      title: "Prefer safe defaults with opt-in production knobs",
      decisionDate: "2026-06-01",
      rationale: "The project should be simple locally but not naive when deployed.",
      alternatives: "Local-only assumptions|Full enterprise auth before portfolio launch",
      outcome: "The app ships local-first defaults plus account sessions, per-user data ownership, encrypted secrets, SSRF checks, and database-backed rate limits.",
      participants: "Aditi|Engineering review",
    },
    content: `# Production Hardening Plan

## Safe defaults

The app should run locally with minimal setup, but production should have account sessions, per-user data ownership, encrypted credentials, shared rate limits, and structured logs.

## Database-backed throttling

In-memory limits are fine for one local process. Production can set RATE_LIMIT_BACKEND=database so expensive endpoints share counters through Prisma.

## Public URL ingestion

URL imports must not fetch localhost, private networks, link-local addresses, or redirect chains into internal infrastructure.

## Error handling

API routes should produce useful error IDs and structured logs so deployed failures can be traced without exposing internals to the browser.`,
  },
  {
    title: "Portfolio Reviewer Walkthrough",
    project: "portfolio",
    tags: ["demo", "review", "readiness"],
    decision: {
      title: "Seed the app with realistic reviewer data",
      decisionDate: "2026-06-18",
      rationale: "A polished demo should show behavior immediately instead of asking reviewers to invent sample notes and emails.",
      alternatives: "Empty database|Screenshots only",
      outcome: "A deterministic seed command creates notes, decisions, inbox data, sent emails, templates, and chat history.",
      participants: "Aditi|Portfolio reviewer",
    },
    content: `# Portfolio Reviewer Walkthrough

## First five minutes

The reviewer should be able to install dependencies, initialize the database, seed demo data, start the app, and ask a note-grounded question.

## What to inspect

- Notes are chunked and searchable.
- Decisions link back to note context.
- Chat responses can cite source chunks.
- Inbox workflows work in demo mode without real email credentials.
- Sent emails show a delivery lifecycle.

## What screenshots should show later

Screenshots should cover the dashboard, citation chat, notes, decisions, inbox analysis, sent email timeline, settings, and one responsive/mobile view.`,
  },
]

const INBOX_EMAILS = [
  {
    fromAddress: "sarah@acme.example",
    fromName: "Sarah Chen",
    subject: "Decision needed: migration window",
    body: "Can you confirm whether we should run the database migration tonight or move it to next week? The runbook is ready, but the connection pool setting still needs a final review.",
    category: "urgent",
    action: "reply_needed",
    summary: "Sarah needs a final call on the database migration window.",
    keyPoints: ["Migration runbook is ready", "Connection pool setting needs review", "Decision needed today"],
    suggestedReply: "Thanks Sarah. Let's move the migration to next week and use tomorrow to verify the pooler config.",
  },
  {
    fromAddress: "notifications@github.example",
    fromName: "GitHub",
    subject: "Review requested: citation panel polish",
    body: "A new pull request updates the citation side panel, loading states, and chunk preview interactions.",
    category: "important",
    action: "review",
    summary: "A UI review is requested for citation panel improvements.",
    keyPoints: ["Citation panel changed", "Loading states updated", "Chunk previews affected"],
    suggestedReply: "",
  },
  {
    fromAddress: "newsletter@systems.example",
    fromName: "Systems Weekly",
    subject: "Local-first AI tools and production RAG checks",
    body: "This week covers local-first AI, RAG evaluation, and operational patterns for small AI products.",
    category: "newsletter",
    action: "archive",
    summary: "A newsletter about local-first AI and production RAG.",
    keyPoints: ["Local-first AI", "RAG evaluation", "Operational patterns"],
    suggestedReply: "",
  },
]

const EMAIL_TEMPLATES = [
  {
    name: "Daily Digest",
    type: "digest",
    subject: "Memex Daily Digest",
    bodyMarkdown:
      "# Memex Daily Digest\n\nGenerated {{date}}\n\n## Recent Decisions\n{{decisions}}\n\n## Recent Questions\n{{questions}}\n",
  },
  {
    name: "Decision Brief",
    type: "brief",
    subject: "Decision: {{title}}",
    bodyMarkdown:
      "# {{title}}\n\n**Decided:** {{date}}\n\n**Rationale:** {{rationale}}\n\n**Alternatives:** {{alternatives}}\n\n_Source: {{source}}_\n",
  },
  {
    name: "Source Snapshot",
    type: "snapshot",
    subject: "Source: {{sourcePath}}",
    bodyMarkdown:
      "# {{sourcePath}}\n\n{{chunkText}}\n\n---\nSent from Memex citation-first knowledge retrieval.\n",
  },
]

async function main() {
  console.log("Resetting and seeding Memex demo data...")

  await resetDatabase()
  await seedUser()
  await seedProfile()
  await seedTemplates()
  await seedNotes()
  await seedEmailWorkflow()
  await seedChat()

  console.log("Seed complete. Open http://localhost:3000 and sign in with:")
  console.log(`  Email: ${DEMO_EMAIL}`)
  console.log(`  Password: ${DEMO_PASSWORD}`)
}

async function resetDatabase() {
  await db.authSession.deleteMany()
  await db.rateLimitBucket.deleteMany()
  await db.inboxEmail.deleteMany()
  await db.emailAccount.deleteMany()
  await db.email.deleteMany()
  await db.emailTemplate.deleteMany()
  await db.chatMessage.deleteMany()
  await db.chatSession.deleteMany()
  await db.decision.deleteMany()
  await db.chunk.deleteMany()
  await db.note.deleteMany()
  await db.profile.deleteMany()
  await db.user.deleteMany()
}

async function seedUser() {
  await db.user.create({
    data: {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      name: "Memex User",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      emailVerifiedAt: new Date(),
    },
  })
}

async function seedProfile() {
  await db.profile.create({
    data: {
      id: "demo-profile",
      userId: DEMO_USER_ID,
      email: DEMO_EMAIL,
      name: "Memex User",
      smtpHost: "smtp.memex.local",
      smtpPort: 587,
      smtpUser: "",
      dailyDigest: true,
      digestHour: 9,
      dataEncryption: true,
      llmPrivacyMode: true,
      autoDeleteDays: 0,
    },
  })
}

async function seedTemplates() {
  await db.emailTemplate.createMany({
    data: EMAIL_TEMPLATES.map((template) => ({
      ...template,
      userId: DEMO_USER_ID,
    })),
  })
}

async function seedNotes() {
  for (const noteInput of NOTES) {
    const chunks = chunkMarkdown(noteInput.content)
    const note = await db.note.create({
      data: {
        userId: DEMO_USER_ID,
        title: noteInput.title,
        content: noteInput.content,
        sourcePath: `/notes/demo/${slugify(noteInput.title)}.md`,
        project: noteInput.project,
        tags: noteInput.tags.join(","),
        contentHash: sha256(noteInput.content),
        chunkCount: chunks.length,
        pinned: noteInput.project === "portfolio",
      },
    })

    const createdChunks = []
    for (const chunk of chunks) {
      const created = await db.chunk.create({
        data: {
          userId: DEMO_USER_ID,
          noteId: note.id,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          headingPath: chunk.headingPath,
          tokens: estimateTokens(chunk.text),
          termFreq: JSON.stringify(termFreq(chunk.text)),
        },
      })
      createdChunks.push(created)
    }

    const sourceChunk = createdChunks[0]
    seededSources.set(noteInput.title, { note, chunks: createdChunks })

    if (sourceChunk) {
      await db.decision.create({
        data: {
          userId: DEMO_USER_ID,
          noteId: note.id,
          chunkId: sourceChunk.id,
          title: noteInput.decision.title,
          decisionDate: noteInput.decision.decisionDate,
          rationale: noteInput.decision.rationale,
          alternatives: noteInput.decision.alternatives,
          outcome: noteInput.decision.outcome,
          participants: noteInput.decision.participants,
          project: noteInput.project,
          confidence: 0.92,
          pinned: noteInput.project === "portfolio",
        },
      })
    }

    console.log(`  note: ${note.title} (${chunks.length} chunks)`)
  }
}

async function seedEmailWorkflow() {
  const account = await db.emailAccount.create({
    data: {
      userId: DEMO_USER_ID,
      emailAddress: DEMO_EMAIL,
      displayName: "Memex Demo Inbox",
      imapHost: "imap.memex.local",
      imapPort: 993,
      imapUser: DEMO_EMAIL,
      imapSecure: true,
      imapPassword: "",
      smtpHost: "smtp.memex.local",
      smtpPort: 587,
      smtpUser: DEMO_EMAIL,
      smtpSecure: true,
      smtpPassword: "",
      connected: true,
      syncMode: "demo",
      lastSyncAt: new Date(),
    },
  })

  const now = Date.now()
  for (let index = 0; index < INBOX_EMAILS.length; index++) {
    const email = INBOX_EMAILS[index]
    await db.inboxEmail.create({
      data: {
        userId: DEMO_USER_ID,
        accountId: account.id,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        toAddress: account.emailAddress,
        subject: email.subject,
        body: email.body,
        category: email.category,
        action: email.action,
        summary: email.summary,
        keyPoints: JSON.stringify(email.keyPoints),
        suggestedReply: email.suggestedReply,
        analyzed: true,
        threadId: slugify(email.subject).slice(0, 40),
        isRead: index === 2,
        isStarred: index === 0,
        receivedAt: new Date(now - index * 45 * 60_000),
      },
    })
  }

  await db.email.createMany({
    data: [
      {
        userId: DEMO_USER_ID,
        toAddress: "sarah@acme.example",
        fromName: "Memex",
        subject: "Re: Decision needed: migration window",
        bodyMarkdown:
          "Hi Sarah,\n\nLet's move the migration to next week and use tomorrow to verify the pooler config.\n\nThanks,\nMemex User",
        bodyHtml:
          "<p>Hi Sarah,</p><p>Let's move the migration to next week and use tomorrow to verify the pooler config.</p><p>Thanks,<br>Memex User</p>",
        status: "delivered",
        sourceType: "inbox",
        isAiGenerated: true,
        verified: true,
        attempts: 1,
        sentAt: new Date(now - 30 * 60_000),
        deliveredAt: new Date(now - 29 * 60_000),
      },
      {
        userId: DEMO_USER_ID,
        toAddress: "team@example.com",
        fromName: "Memex",
        subject: "Weekly decision brief",
        bodyMarkdown:
          "# Weekly decision brief\n\n- Postgres remains the production database.\n- Citation-first answers remain the RAG quality gate.\n- Email sends require human verification.",
        bodyHtml:
          "<h1>Weekly decision brief</h1><ul><li>Postgres remains the production database.</li><li>Citation-first answers remain the RAG quality gate.</li><li>Email sends require human verification.</li></ul>",
        status: "scheduled",
        sourceType: "digest",
        isAiGenerated: true,
        verified: true,
        scheduledFor: new Date(now + 24 * 60 * 60_000),
      },
    ],
  })
}

async function seedChat() {
  const databaseSource = seededSources.get("Database Selection")
  const citationChunk = databaseSource?.chunks?.[0]
  const citations = citationChunk
    ? [
        {
          chunkId: citationChunk.id,
          noteId: databaseSource.note.id,
          sourcePath: databaseSource.note.sourcePath,
          chunkIndex: citationChunk.chunkIndex,
          snippet: citationChunk.text.slice(0, 160),
          score: 1,
        },
      ]
    : []

  const session = await db.chatSession.create({
    data: {
      userId: DEMO_USER_ID,
      title: "Reviewer demo questions",
    },
  })

  await db.chatMessage.createMany({
    data: [
      {
        userId: DEMO_USER_ID,
        sessionId: session.id,
        role: "user",
        content: "Why did we pick Postgres?",
      },
      {
        userId: DEMO_USER_ID,
        sessionId: session.id,
        role: "assistant",
        content:
          `Postgres was chosen because ACID guarantees, JSONB, full-text search, and reliable backups fit the project better than MongoDB flexibility.${citationChunk ? ` [^${citationChunk.id}]` : ""}`,
        citations: JSON.stringify(citations),
      },
    ],
  })
}

function chunkMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/)
  const chunks = []
  let headingPath = ""
  let current = []

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading && current.join("\n").trim()) {
      chunks.push(makeChunk(chunks.length, headingPath, current.join("\n")))
      current = []
    }
    if (heading) {
      headingPath = heading[2].trim()
    }
    current.push(line)
  }

  if (current.join("\n").trim()) {
    chunks.push(makeChunk(chunks.length, headingPath, current.join("\n")))
  }

  return chunks
}

function makeChunk(chunkIndex, headingPath, text) {
  return {
    chunkIndex,
    headingPath,
    text: text.trim(),
  }
}

function termFreq(text) {
  const counts = {}
  for (const token of tokenize(text)) {
    counts[token] = (counts[token] || 0) + 1
  }
  return counts
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3))
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex")
  const derivedKey = await scrypt(password, salt, 64)
  return `scrypt:v1:${salt}:${Buffer.from(derivedKey).toString("hex")}`
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
