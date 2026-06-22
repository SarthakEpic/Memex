// Seed script: 8 hand-written Markdown notes covering realistic engineering
// decisions. Run with: bun run scripts/seed.ts

import { db } from "../src/lib/db"
import { chunkMarkdown, contentHash, termFreq, estimateTokens } from "../src/lib/notes"

const NOTES: { title: string; project: string; tags: string[]; content: string }[] = [
  {
    title: "Database Selection",
    project: "core",
    tags: ["decision", "database", "postgres"],
    content: `# Database Selection

## Postgres vs Mongo

We picked Postgres because ACID guarantees matter for financial data. Mongo's document model was tempting but we'd lose transactions across collections. Postgres 16 also gives us \`tsvector\` full-text search, JSONB columns, and recursive CTEs — enough to avoid a separate search engine at this scale.

Decided 2024-03-14: Postgres for primary DB. Mongo deferred indefinitely.

## Why not SQLite

SQLite is great for tests but the read-replica + connection pool story is weak. We need concurrent writers from queue workers, which SQLite serializes.

## Connection pooling

Using PgBouncer in transaction mode. Pool size 20 per backend instance. No statement_timeout (let queries run; we measure p95 separately).

## Backups

Nightly \`pg_dump\` to S3-compatible storage. Qdrant snapshots on the same schedule. Retention 30 days. Tested restore once a quarter — last restore drill took 14 minutes for 8 GB.`,
  },
  {
    title: "Caching Strategy",
    project: "core",
    tags: ["decision", "cache", "redis"],
    content: `# Caching Strategy

## Redis 7 for cache + queue

Decided 2024-04-02: Redis 7 with RQ for the ingestion queue. Valkey was considered but Redis 7 is stable and the team knows it. No Memurai — we're on Linux.

## Cache layers

1. **Result cache** — keyed by sha256(query), TTL 1 hour. Stores the top-8 chunk IDs + the LLM answer. Invalidation: TTL only (notes rarely change retroactively).
2. **Embedding cache** — keyed by sha256(text). Permanent (content-addressed).
3. **Session cache** — per-user chat history, LRU evict at 50 messages.

## Kill switch

If p95 latency > 1.5s on /chat, the result cache becomes mandatory (every query hits cache or queues a refresh, no live retrieval). Documented in ARCHITECTURE.md.

## What we did NOT cache

- LLM streaming tokens (the cache stores the final answer, not the stream)
- Per-chunk term frequencies (cheap to recompute)
- User profiles (too small to bother)`,
  },
  {
    title: "Vector Database Evaluation",
    project: "core",
    tags: ["decision", "vector", "qdrant"],
    content: `# Vector Database Evaluation

We evaluated four vector stores before settling on Qdrant 1.12 self-hosted.

## Candidates

- **Qdrant 1.12** — Rust core, fast filtering, good Python client. Won.
- **Milvus 2.4** — Powerful but ops-heavy. Three containers minimum. Overkill.
- **pgvector** — Tempting (one less service) but HNSW index rebuilds lock writes and Recall@5 was 6 points lower in our benchmark.
- **Weaviate** — GraphQL API is nice but the JS-first ecosystem clashed with our Python backend.

Decided 2024-05-10: Qdrant 1.12, single node, 8 GB RAM allocation. Collection \`memex_chunks\`, 1024-dim BGE-M3 vectors, HNSW m=16 ef_construct=128.

## Recall benchmark

On our 100-question golden set:
- pgvector HNSW: Recall@5 = 0.55
- Qdrant HNSW: Recall@5 = 0.61

The 6-point gap was the deciding factor. We revisit annually.

## Disk vs RAM

Qdrant on-disk mode added 40ms p95. Stayed in-RAM. Disk mode reserved for >10M vectors.`,
  },
  {
    title: "LLM Selection",
    project: "core",
    tags: ["decision", "llm", "ollama"],
    content: `# LLM Selection

## Llama 3.1 8B Instruct via Ollama

Strictly $0 stack — no Anthropic, no OpenAI. Llama 3.1 8B Instruct runs at ~12 tok/s on our box (RTX 4070, 4-bit quant). Good enough for citation-first answers under 200 words.

Decided 2024-05-20: Llama 3.1 8B Instruct, q4_K_M quantization, Ollama runtime.

## Kill criterion

If Llama 3.1 8B faithfulness < 0.75 after prompt tuning, swap to Llama 3.1 70B 4-bit quantized. Still $0, still self-hosted. 70B drops to ~3 tok/s — only acceptable because we cache aggressively.

## Why not Mistral or Phi

- Mistral 7B: faithfulness 0.71 in our spot check, worse at refusing to speculate.
- Phi-3 mini: great at math, bad at "I don't have a source for this" honesty.

## Citation enforcement

The system prompt forces \`[^chunk_id]\` markers. A post-processor verifies every marker resolves to a chunk actually sent to the model. Stray citations get the sentence stripped.`,
  },
  {
    title: "Auth Architecture",
    project: "platform",
    tags: ["decision", "auth", "keycloak"],
    content: `# Auth Architecture

## Keycloak 25+ self-hosted

Decided 2024-06-01: Keycloak for OIDC. Realm \`memex\`, two clients: \`memex-web\` (public, Next.js) and \`memex-api\` (confidential, FastAPI).

## Why Keycloak over Auth0/Clerk

- $0 requirement rules out Auth0 free tier limits.
- Clerk is great but vendor lock-in for a portfolio project felt wrong.
- Keycloak setup is painful but reproducible — realm JSON committed to \`deploy/keycloak-realm.json\`.

## Kill switch

If Keycloak setup takes > 3 days, swap to self-hosted Logto (same OAuth2 + JWT semantics, simpler setup). Document the swap in ARCHITECTURE.md.

## Token validation

Backend verifies JWT signature against Keycloak JWKS endpoint. Extracts \`sub\` and \`email\`. No bypass for "internal" routes — every authenticated endpoint checks the token.

## Session strategy

Next.js uses next-auth with the Keycloak provider. Refresh token rotation on. Session cookie httpOnly, secure, sameSite=lax.`,
  },
  {
    title: "Embeddings & Reranker",
    project: "core",
    tags: ["decision", "embeddings", "reranker"],
    content: `# Embeddings & Reranker

## BGE-M3 for embeddings

Decided 2024-06-15: BGE-M3 self-hosted via a FastAPI sidecar. 1024-dim, multilingual, strong on long context. Runs on CPU at ~80ms/embed (batch 32).

## BGE-Reranker-v2-m3 for reranking

Cross-encoder reranker on top of RRF top-20. Recall@5 jumped 0.74 → 0.84. p95 rose 180ms → 380ms. The trade was worth it.

## Kill criterion

If Recall@5 after reranker < 0.78, drop the reranker and ship with RRF only. The latency tax is not justified without a meaningful recall gain. We hit 0.84, so it stays.

## Sidecar architecture

Both models run in separate FastAPI sidecars (one container each). Health check at \`/health\`. If a sidecar is down, retrieval degrades gracefully — embeddings fall back to BM25-only, reranking is skipped.

## Why not OpenAI text-embedding-3

$0 stack. Also, BGE-M3 is competitive on MTEB and we keep all data on-host.`,
  },
  {
    title: "Observability Stack",
    project: "platform",
    tags: ["decision", "observability", "langfuse"],
    content: `# Observability Stack

## Langfuse 3.x self-hosted

Decided 2024-07-10: Langfuse for LLM tracing. Every \`generate_answer\` and \`retrieve\` call is a trace with spans. Token cost, latency, prompt, response all logged.

## Why not LangSmith / Helicone

- LangSmith requires an Anthropic/OpenAI key — breaks $0 rule.
- Helicone free tier has trace limits.
- Langfuse self-hosted is MIT, stores everything in Postgres we already run.

## Structured logs

Backend uses structlog with JSON output. No \`print()\` in committed code. Logs include trace_id (from Langfuse) so a log line maps to a trace.

## Metrics we track

- Recall@5, MRR, RAGAS faithfulness — per PR (CI)
- p95 latency per endpoint — Datadog-free, just \`prometheus_client\` + Grafana
- Token count per request — Langfuse
- Cache hit rate — custom counter in Redis

## Alerting

PagerDuty-free. A cron job checks the last 5 min of \`/health\` pings; if any service is down, it sends an email. Yes, an email. From Memex itself.`,
  },
  {
    title: "Frontend Stack",
    project: "platform",
    tags: ["decision", "frontend", "nextjs"],
    content: `# Frontend Stack

## Next.js 16 + React 19

Decided 2024-07-25: Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4, shadcn/ui (New York style).

## Why Next.js over Remix/Vite

- App Router RSC lets us keep auth on the server, no token in client bundle.
- Streaming SSE for chat tokens is well-supported.
- shadcn/ui components copy-paste in, no library lock-in.

## Tailwind 4 + shadcn/ui

Tailwind 4's CSS-first config is faster. shadcn/ui New York style: smaller radius, more compact. Lucide icons throughout.

## State management

- Zustand for client state (active section, selected chunk)
- TanStack Query for server state (notes, decisions, emails)
- No Redux. Period.

## Citation rendering

Chat answers render \`[^chunk_id]\` markers as clickable pill buttons. Click → fetch \`/chunks/{id}\` → side panel with source text + scroll position. Multiple citations stack as tabs in the panel.`,
  },
]

async function main() {
  console.log("Seeding Memex database…")

  // Reset
  await db.email.deleteMany()
  await db.emailTemplate.deleteMany()
  await db.chatMessage.deleteMany()
  await db.chatSession.deleteMany()
  await db.decision.deleteMany()
  await db.chunk.deleteMany()
  await db.note.deleteMany()
  await db.profile.deleteMany()

  // Profile + default templates
  await db.profile.create({
    data: {
      id: "me",
      email: "you@memex.local",
      name: "Memex User",
      smtpHost: "smtp.memex.local",
      smtpPort: 587,
      dailyDigest: true,
      digestHour: 9,
    },
  })

  await db.emailTemplate.createMany({
    data: [
      {
        name: "Daily Digest",
        type: "digest",
        subject: "Memex Daily Digest",
        bodyMarkdown:
          "# Memex Daily Digest\n\n_Generated {{date}}_\n\n## Recent Decisions\n{{decisions}}\n\n## Recent Questions\n{{questions}}\n",
      },
      {
        name: "Decision Brief",
        type: "brief",
        subject: "Decision: {{title}}",
        bodyMarkdown:
          "# {{title}}\n\n**Decided:** {{date}}\n**Rationale:** {{rationale}}\n**Alternatives:** {{alternatives}}\n\n_Source: {{source}}_\n",
      },
      {
        name: "Source Snapshot",
        type: "snapshot",
        subject: "Source: {{sourcePath}}",
        bodyMarkdown:
          "# {{sourcePath}}\n\n{{chunkText}}\n\n---\n_Sent from Memex · citation-first knowledge retrieval_\n",
      },
    ],
  })

  // Notes → chunk → store
  for (const n of NOTES) {
    const sourcePath = `/notes/${n.title.toLowerCase().replace(/\s+/g, "-")}.md`
    const hash = await contentHash(n.content)
    const note = await db.note.create({
      data: {
        title: n.title,
        content: n.content,
        sourcePath,
        project: n.project,
        tags: n.tags.join(","),
        contentHash: hash,
      },
    })

    const chunks = chunkMarkdown(n.content, n.title)
    for (const c of chunks) {
      const tf = termFreq(c.text)
      await db.chunk.create({
        data: {
          noteId: note.id,
          chunkIndex: c.chunkIndex,
          text: c.text,
          headingPath: c.headingPath,
          tokens: estimateTokens(c.text),
          termFreq: JSON.stringify(tf),
        },
      })
    }
    await db.note.update({
      where: { id: note.id },
      data: { chunkCount: chunks.length },
    })
    console.log(`  ✓ ${n.title} → ${chunks.length} chunks`)
  }

  console.log("Seed complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
