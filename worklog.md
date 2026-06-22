# Memex — Worklog

## Project Overview
Building **Memex**, a citation-first knowledge retrieval system for personal Markdown notes, adapted from a FastAPI/Qdrant/Postgres/Ollama spec to our sandbox stack (Next.js 16 + Prisma/SQLite + z-ai-web-dev-sdk). The user also requested **email integration**.

## Adaptation Decisions (sandbox constraints)
- **Backend**: Next.js API routes instead of FastAPI.
- **DB**: Prisma + SQLite instead of Postgres. BM25 done in JS (no `tsvector`).
- **Vector store**: No Qdrant / no embeddings API in z-ai SDK. Use **BM25 (TF-IDF) keyword retrieval** + optional **LLM rerank** for semantic matching. This keeps the citation-first contract intact.
- **LLM**: `z-ai-web-dev-sdk` `chat.completions.create` instead of Ollama/Llama.
- **Auth**: No Keycloak. Single-demo-user mode (current user derived from a fixed demo profile in DB).
- **Email**: Simulated SMTP — emails stored in DB `Email` table with status workflow (queued → sent → delivered), plus a digest scheduler. Real SMTP could be dropped in behind the same `sendEmail` interface.
- **Eval / Langfuse / RAGAS**: Out of scope for this sandbox build (no Python). Eval metrics surfaced in a lightweight in-app "Retrieval health" panel instead.

## Differentiators preserved
1. **Citation-first generation** — every claim cites a chunk via `[^chunkId]`; unciteable claims become "I don't have a source for this."
2. **Decision timeline** — LLM extracts decisions from notes; queryable as "why did I decide X?"
3. **Honest eval** — surfaced as a retrieval-health dashboard (chunk count, avg terms, decision count, citation coverage) since RAGAS/Python isn't available here.

## Email integration scope
- Compose modal reachable from Chat answers, Decision cards, and Notes ("Email this").
- Outbox + inbox view with status pipeline.
- Reusable templates (Daily Digest, Decision Brief, Source Snapshot).
- Scheduled digest job (every 15 min) that bundles recent decisions + unanswered questions into one email.

---
Task ID: 1
Agent: main
Task: Foundation — Prisma schema, db push, seed markdown notes

Work Log:
- Designed Prisma schema for Note, Chunk, Decision, ChatSession, ChatMessage, Email, EmailTemplate, plus a Profile model for the demo user + email settings.
- Will push schema and seed 8 hand-written Markdown notes covering realistic engineering decisions (Postgres vs Mongo, caching, auth, vector DB, etc.) so chat/decision extraction have real content.

---
Task ID: 2-5
Agent: main
Task: Lib utilities, API routes, full UI, browser verification

Work Log:
- Built lib utilities: `notes.ts` (markdown chunker + BM25 scorer + term-freq + content hash), `llm.ts` (citation-enforced answer generation + LLM reranker + decision extractor via z-ai-web-dev-sdk), `retrieval.ts` (in-memory BM25 index with 5s cache + LLM rerank), `email.ts` (simulated SMTP pipeline + digest builder), `markdown.ts` (md→html renderer).
- Seeded 8 hand-written engineering-decision Markdown notes (Postgres, Redis, Qdrant, Llama 3.1, Keycloak, BGE-M3, Langfuse, Next.js) → 36 chunks. Profile + 3 email templates seeded.
- Built 16 API routes: notes (CRUD+ingest+chunk+extract), chat (citation-first), chat sessions, chunks, decisions (list+search+detail+extract), timeline, stats, emails (send+list+detail+delete), email templates, email digest, profile.
- Built UI in `src/components/memex/`: store (Zustand), types, sidebar (+mobile nav), dashboard, chat (with citation pills + source strip + email/copy), notes (list+detail+add dialog), decisions (cards+detail dialog), timeline (chronological rail), email (outbox+detail+compose), settings (profile+SMTP+digest), source-panel (Sheet), email-composer (Dialog), answer-renderer (markdown+citations).
- Wired `src/app/page.tsx` as a single-route workspace. Added Providers (QueryClientProvider + Sonner toasters) to layout. Added citation-pill + scrollbar + timeline-rail CSS to globals.
- Ran decision extraction on seeded notes → 5 decisions (rate-limited at 429 after that; will resume via cron).

Verification (agent-browser):
- Dashboard renders: 8 notes, 36 chunks, 5 decisions, citation coverage + refusal rate panels.
- Chat: asked "Why did we pick postgres?" → LLM returned cited answer with 5 [^chunkId] pills + 3-entry source strip. Clicking a pill opens source Sheet showing chunk text + note metadata + Email button.
- Decisions: 5 cards with confidence bars, project filter, rationale excerpts. Detail dialog shows alternatives + source chunk.
- Timeline: notes + decisions interleaved by day with colored dots.
- Email: composed + sent a test email → "Email delivered" toast → appears in outbox with "delivered" badge → detail view shows rendered HTML + raw markdown. Fixed: composer now invalidates emails/stats queries on send.
- Notes: 8 notes listed with tags/chunk counts. Add-note dialog ingests + chunks + extracts decisions.
- Lint: clean. Dev log: all API routes 200, no runtime errors.

Stage Summary:
- Memex is fully functional end-to-end: ingest markdown → chunk → BM25 index → ask question → LLM answer with inline citations → click citation → source panel → email the answer/decision/note/digest.
- Email integration complete: compose modal (reachable from chat, decisions, notes, timeline, sidebar), outbox with status pipeline, rendered HTML preview, daily digest generator, templates, profile/SMTP settings.
- Known limitation: z-ai-web-dev-sdk has no embeddings API → used BM25 + LLM rerank instead of vector search. Citation-first contract preserved.
- Rate limits (429) on the LLM service throttled bulk decision extraction; 5/8 notes have decisions. The webDevReview cron will retry extraction opportunistically.
