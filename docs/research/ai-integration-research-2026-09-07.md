# Memex AI Integration: Reliability Under Free API Limits

**Research date:** 7 September 2026
**Audience:** Memex owner and future implementation work
**Scope:** AI product behavior, capacity, information quality, privacy, and operating economics. This is not a code-quality audit or an implementation change.

## Executive Answer

An ordinary mailbox can overwhelm a free AI allowance without being a large dataset. The limiting resource is how often the application sends information for inference, how much context each request includes, and how background work competes with the user's current task.

Memex should be a capable email application with selectively invoked AI, not an application that needs an LLM to perform every operation. Keep the database, search, sync, editing, and confirmed delivery functional independently. Use AI primarily to interpret ambiguous intent, understand relevant passages, and write.

The best direction is **query first, retrieve evidence, reason selectively, reuse verified results, and schedule every AI feature against one shared budget**. This can make bounded personal use much more practical on a free tier. It cannot guarantee unlimited, instant, high-quality, confidential AI for an expanding user base at zero operating cost.

There is no evidence in the companies examined that they achieve that combination by relying on unlimited free upstream APIs. Free user plans, trial credits, and free API plans are different things.

**Evidence boundary:** I inspected integration source, not just the README, and checked official provider and product documentation. I did not read mailbox contents, inspect secrets, call the configured AI account, or reproduce the user's particular quota event. Confirmed behaviors below are static observations; the exact exhausted quota remains unmeasured. No application code was changed.

## 1. What Is Actually Happening in Memex?

### Useful mechanisms already exist

Memex is not simply sending all 100 emails to the AI on every question:

- Common mailbox time/count questions have a database-backed answer path.
- Background analysis uses a persisted queue, local classification, and separate metadata/content stages.
- The important-mail review path retrieves the latest 100 active-message headers, ranks them locally, and considers at most three bodies.
- Saved analysis can be reused.
- Main interactive calls and email-analysis batches use a single provider attempt with a 15-second request timeout.

Sources: [inbox review](D:/Projects/Memex/src/server/email/review-inbox.ts:56), [analysis pipeline](D:/Projects/Memex/src/server/email/analysis-pipeline.ts:158), [AI client](D:/Projects/Memex/src/lib/ai-client.ts:379), [chat route](D:/Projects/Memex/src/app/api/chat/route.ts).

### Remaining logical gaps visible in the source

| Finding | Why it matters |
|---|---|
| The 20-second shared lease governs inbox analysis/review, not all AI features. | Chat, drafting, note reranking, and other features can compete outside that pacing rule while spending the same provider allowance. |
| Successful completion usage is not returned by the central wrapper. | The app lacks the input/output usage evidence needed to attribute consumption and reconcile reservations accurately. |
| Pacing is request-based, not a complete token budget. | One large request can cost more than several small ones; spacing calls cannot protect a daily allowance. |
| Some note questions can use an AI reranker before the answer model. | One visible user request can become multiple model calls. |
| Background body analysis requests suggested replies when it thinks a reply is needed. | The app may spend generation tokens before the user asks for a draft. |
| Important-mail review only considers the newest 100 active messages and selects three. | A useful quick review is not an exhaustive mailbox review. Older important mail can be absent from the candidate set. |
| The review body is capped at 1,400 characters. Reply context elsewhere keeps a head/tail sample. | An instruction beyond the prefix or inside the omitted middle can be missed. |
| Main answer history is character-capped, but there is no single all-input token budget. | System instructions, current question, retrieved evidence, history, output allowance, and reasoning all need joint accounting. |
| The queue increments attempts on deferral/failure and stops after four attempts. | Persistent quota exhaustion should wait for capacity/reset, not turn an otherwise valid email into a permanently failed analysis job. |
| Some responses collapse different provider failures into rate-limit wording. | Users cannot tell whether to wait, reconnect, correct configuration, reduce scope, or retry. |

Relevant source: [AI client](D:/Projects/Memex/src/lib/ai-client.ts:309), [batch prompts](D:/Projects/Memex/src/server/email/ai-batch.ts:50), [history and reply context](D:/Projects/Memex/src/lib/llm.ts:90), [chat routing](D:/Projects/Memex/src/app/api/chat/route.ts:393), [queue deferral](D:/Projects/Memex/src/server/email/analysis-pipeline.ts:384).

There is also a default retry path with application retries layered over SDK retries. It can amplify attempts on some non-interactive calls; this does **not** describe the current no-retry Chat and batch paths. Investigate usage by feature before blaming retries or mailbox size alone.

## 2. Understand the Different Limits

For the model shown in the earlier setup, Groq currently lists these public free-plan limits:

| Model | Requests/minute | Requests/day | Tokens/minute | Tokens/day |
|---|---:|---:|---:|---:|
| openai/gpt-oss-120b | 30 | 1,000 | 8,000 | 200,000 |
| openai/gpt-oss-20b | 30 | 1,000 | 8,000 | 200,000 |

Limits apply at organization level, not separately to every Memex user or API key. Account-specific limits may differ; the organization's console and response headers take precedence. A 429 alone does not identify the exact limit. [Groq rate-limit documentation](https://console.groq.com/docs/rate-limits)

**Illustration, not measured Memex usage:** suppose a request consumes 2,500 input tokens and 500 total generated tokens. Three such requests together represent 9,000 tokens, enough to conflict with an 8,000-token minute allowance despite being far below 30 requests. A 200,000-token daily budget covers roughly 66 such requests before any other work, assuming no cache savings.

A large context window only means a model can accept a large context. It does not mean your account can afford or admit that request.

Other distinct constraints include concurrent requests, context length, output length, tool/service limits, account billing restrictions, and temporary provider overload. Their remedies differ. A daily quota needs postponement or additional capacity; a malformed request needs correction; a network timeout needs diagnosis.

## 3. How Other Applications Handle This

### Shortwave: retrieval infrastructure plus explicit quotas

Shortwave's published engineering account describes traditional search, embeddings, heuristic ranking, then a more expensive ranking stage over selected fragments. It describes operating its own GPU-backed embedding and ranking infrastructure, not simply putting the whole mailbox into every prompt. This is a historical architecture account, published 17 October 2023, not proof of its exact current model stack. [Shortwave engineering deep dive](https://www.shortwave.com/blog/deep-dive-into-worlds-smartest-email-ai/)

Its current pricing explicitly limits daily AI usage and threads loaded per search. The listed Business quota is approximately 150-300 Standard-intelligence requests per day, with consumption varying by complexity and intelligence level. [Shortwave pricing](https://www.shortwave.com/pricing/)

**Lesson for Memex:** retrieve across the mailbox efficiently, spend the expensive model on selected evidence, and make product capacity explicit. Do not copy Shortwave's multi-call search pipeline blindly onto a tiny free quota.

### Spark: free email core, limited AI preview, paid AI quotas

Spark offers core email management free, a limited free AI preview, and monthly AI quotas on paid plans. Composing, summaries, and other AI features consume the allowance. It warns users near exhaustion and offers eligible users a top-up or a wait until reset. [Spark pricing and quota FAQ](https://sparkmailapp.com/pricing)

**Lesson for Memex:** AI exhaustion should not disable ordinary email work. Communicate the remaining service rather than displaying a generic failure.

### Proton Scribe: local or server compute, funded access

Proton supports local and server-side Scribe operation. Its availability documentation includes Scribe with selected paid plans, a business add-on, and a limited trial for other paid Mail plans. [Proton Scribe availability](https://proton.me/support/proton-scribe-writing-assistant)

**Lesson for Memex:** local inference moves the compute burden to the device; server inference moves it to the operator. It does not eliminate the burden. A powerful local model is not a suitable primary requirement for the modest device described here.

**Finding:** these examples support bounded access, selective processing, and funded infrastructure. Their public documentation does not establish that their free experiences run on free upstream API accounts. Internal subsidies, margins, and provider contracts are not publicly established by these sources.

## 4. Comprehensive Logical Risk Register

These are failure classes to design and test for, not 36 claims that each defect has been reproduced in Memex. The current-state findings are separately identified above.

### Capacity and responsiveness

| # | Problem | Product-level response |
|---|---|---|
| 1 | Background work spends the quota needed for the user's next question. | Reserve interactive capacity; pause speculative work first. |
| 2 | All accounts/users share a provider pool. One busy user monopolizes it. | Organization-wide admission plus fair per-user budgets and queues. |
| 3 | Request counting ignores variable prompt/output sizes. | Reserve estimated tokens and reconcile actual usage; enforce every applicable quota window. |
| 4 | First connection triggers historical backfill. | Import separately from AI; make historical analysis incremental and optional. |
| 5 | Requests arrive faster than the queue can drain. | Limit admission, coalesce obsolete work, disclose coverage and waiting state. A queue cannot manufacture capacity. |
| 6 | Browser refreshes, repeat clicks, and concurrent workers duplicate analysis. | Deduplicate identical user/source/version/task work and share an in-flight result. |
| 7 | Retries amplify overload or continue after quota is unavailable for hours. | One retry owner, bounded jitter, provider reset awareness, and separate daily exhaustion from transient failure. |
| 8 | Slow calls leave users staring at a spinner; a closed tab may leave work running. | Fast acknowledgements, honest progress, cancellation where possible, and end-to-end deadlines. |
| 9 | One task expands into routing, search, reranking, verification, and multiple agents. | Bound calls, tool steps, elapsed time, and tokens per task; use simple workflows first. |
| 10 | A low output cap produces broken JSON or an unfinished answer. | Budget the requested structure and reasoning; detect incomplete results rather than treating them as valid. |
| 11 | Model changes, provider incidents, or free-tier changes break assumptions. | Capability checks, versioned evaluations, configurable budgets, and graceful non-AI operation. |
| 12 | Free hosting cannot run the background worker often enough. | Match worker cadence to backlog and daily capacity; show actual progress, not an assumed completion time. |

AWS documents why retry storms, missing deadlines, and synchronized retries worsen overload. Anthropic recommends choosing the simplest effective workflow and recognizes the latency/cost tradeoff of agentic complexity. These support the operating principles, not a claim that every application must use the same scheduler. [AWS retry guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html), [Anthropic effective agents](https://www.anthropic.com/research/building-effective-agents)

### Information quality and task correctness

| # | Problem | Product-level response |
|---|---|---|
| 13 | A vague subject hides a critical instruction. | Treat title-first as prioritization, not proof of irrelevance; include body search and uncertain candidates. |
| 14 | The important email is older, archived, or not imported. | Search the requested account/date scope; distinguish provider mailbox coverage from local coverage. |
| 15 | Truncation removes the deadline, amount, exception, or attachment reference. | Retrieve query-relevant passages; expand uncertain cases and disclose omitted content. |
| 16 | Thread quotations duplicate tokens and obsolete instructions. | Separate newest authored content from quoted history, preserving the relevant earlier decision. |
| 17 | Attachments, scanned documents, images, and calendar invites contain the answer. | Detect these sources and disclose whether they were examined; selectively extract/OCR when justified. |
| 18 | A cached summary is stale after a reply or user action. | Version by source and thread state; invalidate affected facts and resolve from current evidence. |
| 19 | The AI treats a prior generated summary as unquestionable fact. | Store supporting source passages and distinguish extracted facts from inferred judgments. |
| 20 | “Important” differs by person; ranking overweights dramatic wording. | Use user priorities, known contacts, explicit deadlines and correction feedback; keep uncertain items visible. |
| 21 | Language, time zones, and relative dates change meaning. | Evaluate multilingual/Hinglish queries, timezone boundaries, and source date semantics; retain date evidence. |
| 22 | “Reply to that” or “send it” refers to the wrong message/draft. | Maintain explicit selected message, account, draft version, and pending action state; clarify ambiguity. |
| 23 | A syntactically valid answer invents facts or cites irrelevant evidence. | Verify IDs, recipient addresses and concrete claims against sources; valid JSON is not factual validation. |
| 24 | A quick top-k answer is presented as a complete review. | Label searched scope, inspected sources, omitted sources, and pending analysis. Offer bounded deeper review. |

The key tradeoff is not merely fewer tokens versus prettier answers. It is **selection recall**: whether the right email reaches the answer model at all. A stronger model cannot recover an email it never receives.

For incremental sync, Google's documented approach stores a history cursor and requests subsequent changes, with full-sync recovery when the cursor is no longer available. This avoids treating every refresh as a new full import. It is distinct from deciding which changed messages deserve AI analysis. [Gmail synchronization guide](https://developers.google.com/workspace/gmail/api/guides/sync)

### Privacy, actions, and sustainability

| # | Problem | Product-level response |
|---|---|---|
| 25 | Malicious email text tells the assistant to leak data or perform actions. | Treat messages as evidence, not authority; separate reading tools from action permissions and enforce policies outside the model. |
| 26 | Fallback sends confidential content to a provider with different terms. | Maintain an approved provider/model/endpoint list per data class; never silently lower privacy guarantees. |
| 27 | Retention, training, local execution, and encryption are confused. | Describe each separately and verify the actual account settings and endpoints. |
| 28 | Summaries, embeddings, logs, or caches expose private data or cross user boundaries. | User-scoped storage, access checks, retention/deletion policy, and content-free operational telemetry. |
| 29 | A send/retry/schedule executes with the wrong content or executes twice. | Explicit sender and recipient, immutable draft-version approval, idempotency, and reconciliation of uncertain delivery outcomes. |
| 30 | The UI claims an email was sent when only a draft exists or transport status is unknown. | Distinguish prepared, awaiting approval, submitted, accepted, failed, and unknown states. |
| 31 | OAuth/mail-provider policies constrain forwarding email data to AI. | Verify scopes, permitted use, disclosures, third-party processing, and applicable verification requirements before launch. |
| 32 | An attacker exhausts the shared budget using huge inputs, account farming, or repeated tasks. | Bound inputs, work per user, task expansion, and admission; detect abuse without logging private mail. |
| 33 | A cheaper model or compressed prompt reduces quality without anyone noticing. | Evaluate task success and missed critical items, not only token savings. |
| 34 | “Free forever” economics rely on temporary credits or unbounded subsidies. | Define supported usage, capacity limits, funding, and a non-AI fallback before public growth. |
| 35 | AI indexing creates extra storage, embedding, database, and maintenance costs. | Include all operating resources in the budget; do not equate open weights or a vector database with free compute. |
| 36 | Deletion/disconnection removes mail but leaves derived AI data behind. | Track derivations and purge eligible summaries, embeddings, caches, job payloads, and logs under the retention policy. |

Prompt injection remains an active, unsolved risk even for capable agentic models; a system prompt alone is not a security boundary. The controls above are recommendations, not an assertion that Memex's entire action flow has been audited here. [Anthropic prompt-injection research](https://www.anthropic.com/research/prompt-injection-defenses)

## 5. Recommended Operating Model for Memex

### A. Keep ordinary tasks off the LLM

Database/search operations should handle time filters, unread counts, sender filters, selected-message opening, saved-draft editing, and retrieval of existing facts.

For example, “Did I get mail in the last ten minutes?” needs a bounded mailbox query and an explicit last-sync timestamp. If sync is stale, say so or perform an authorized incremental refresh. Do not ask a language model to count an arbitrary sample.

Keep SQL/database retrieval. Remove neither the tool nor deterministic functionality merely to make the product more “AI-driven.” The model can interpret intent while application logic performs scoped, authorized operations.

### B. Replace repeated reading with maintained evidence

Store compact, source-linked facts when justified: who requested what, exact deadline text, normalized date with timezone, amount/currency, reply-needed evidence, and source/version identifiers. Retain uncertainty and coverage.

Do not summarize every email merely to create this index. Start with metadata and ordinary text indexing; extract deeper facts on demand or within spare background capacity. Reuse them until the underlying evidence changes.

For “check important mail”:

1. Resolve account, date range, unread policy, and available sync coverage.
2. Search metadata **and indexed body text** within that scope; use local ranking to prioritize.
3. Include uncertain, low-signal messages instead of excluding them solely by subject.
4. Reuse current facts and fetch relevant passages from missing/uncertain sources.
5. Ask the model only for the remaining judgment or synthesis.
6. Show results with sources and the depth of review.
7. Offer a separately budgeted deeper review when the scope cannot fit.

For “find all deadlines,” prioritize completeness: systematically inspect the scoped candidates over resumable batches. Do not substitute a top-three relevance answer for an exhaustive request.

### C. Introduce one budget owner

All AI features should use a shared admission policy matching the provider's actual quota scope. Maintain per-user fairness inside that policy, across application instances.

Reserve estimated input plus permitted generation before dispatch; reconcile returned usage, including reasoning where reported. Count retries and downstream model calls. Handle separate input/output buckets if the provider exposes them.

A reasonable **initial experiment**, not a universal setting, is 70% interactive capacity, 20% background work, and 10% safety margin. Let interactive work borrow idle capacity while deferring background work. Tune against measured traffic rather than permanently hardcoding those percentages.

Admission must consider both minute and day limits. When daily capacity is unavailable, stop automatic retries and present a truthful resume window only when known.

The current 20-second analysis interval permits at most three batches a minute if work is available and workers run often enough. At eight headers or three bodies per batch, the ideal ceiling is 24 metadata items **or** nine body items per minute, before mixed stages, latency, retries, and other constraints. A less frequent scheduler reduces this further. This arithmetic explains why batching alone can still feel slow.

### D. Spend generation on user value

Do not prewrite replies during ordinary categorization. Generate a reply when requested, with the selected thread and the user's instructions.

Use simpler processing for easy classifications and a capable model for difficult writing or synthesis. Evaluate the model cascade first: a smaller model that causes corrections or repeated calls may cost more overall.

Groq's GPT-OSS models support low/medium/high reasoning effort, with medium as the default. Test lower effort for constrained classification, and measure output completion/usage rather than only lowering the token cap. Structured outputs can improve schema adherence where supported, but cannot establish factual correctness. [Groq API reference](https://console.groq.com/docs/api-reference)

### E. Use two different kinds of caching

**Application result cache:** reuse a result for the same user, source version, task, relevant preferences, model, and prompt version. Deduplicate in-flight work. Do not reuse approvals or delivery actions as cached answers.

**Provider prompt cache:** stable prefixes can avoid repeated processing. Groq documents automatic caching for supported models, expiry after two inactive hours, and no guaranteed hit. Cached tokens are credited against limits after processing, so parallel bursts can still fail. Budget for misses; never pad prompts just to reach a cache threshold. [Groq prompt caching](https://console.groq.com/docs/prompt-caching)

Cache lifecycle must satisfy deletion and privacy requirements. Provider prefix caching and a local saved summary are not equivalent controls.

### F. Preserve confidence without hiding constraints

Useful states include: “Searching synced mail,” “Found 12 matches,” “Reviewed 4 messages; 8 pending,” and “AI analysis paused; search and drafting manually remain available.”

Do not promise “try in one minute” when the daily budget is exhausted. Do not call a result complete because a function returned successfully. Cancellation, partial results, and resumption should refer to real job state.

For email sending, finish with a review of the explicit sending account, recipients, subject, body, and attachments. Require the user's confirmation of that version. Neither an email's content nor the model's output should count as authorization.

## 6. Privacy and Free-Provider Choices

**Groq:** all customers can enable ZDR. Its documentation separates inference retention controls from stateful features; Batch retains files and is disabled under global ZDR. ZDR does not mean processing stays on the device, nor does it increase quota. Confirm the actual organization setting before sending confidential content. [Groq data controls](https://console.groq.com/docs/your-data)

**Gemini:** do not use ordinary unpaid-service terms as the default fallback for confidential mail. The terms permit product improvement and human review and instruct users not to submit confidential/personal data. Account/billing status and regional provisions change which terms apply; review those specifics rather than claiming all Gemini access has identical treatment. [Gemini API terms, effective 23 March 2026](https://ai.google.dev/gemini-api/terms)

**Cloudflare Workers AI:** its published free allocation is 10,000 neurons/day, not 10,000 requests or tokens. Models consume different amounts; some require paid billing. This is another bounded capacity option, not an unlimited replacement. Its specific privacy and model suitability would require a separate approval before using it as a confidential-mail fallback. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

**OpenRouter free models:** the documented default is 50 free-model requests/day; a higher limit is linked to purchased credits. Provider routing also needs its own data-policy review. It is not a general solution to unlimited concurrent use. [OpenRouter FAQ](https://openrouter.ai/docs/faq)

Do not rotate keys/accounts to evade limits. Do not silently route across random free providers.

For a public Gmail integration, Restricted Scope verification and security-assessment requirements can be a launch dependency depending on the access and deployment. Google's Workspace data policy also restricts using transferred user data to improve general AI models. Check applicability before promising a public, permanently zero-cost service. This is a policy dependency, not a legal compliance certification. [Google restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [Workspace user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

Encrypting stored data or using HTTPS is important, but an ordinary cloud inference service still processes the content supplied to it. Redaction can reduce exposure but can remove meaning and does not make remaining content automatically non-confidential. Training on mailbox contents is not required to answer using retrieved evidence.

## 7. What Can Be Free in Practice?

### Personal use or a small controlled group

A free API allowance can support real, useful operation if measured demand fits: deterministic email functionality, selective AI, bounded initial analysis, and transparent deferral. This is a valid product, not necessarily a demo.

However, do not promise a particular daily message count until the input/output distribution and background demand have been measured.

### A growing public application

There must eventually be a capacity/funding decision: limited free AI funded by the operator, optional paid service, sponsorship or credits with an expiry plan, or another legitimate compute budget. Users do not have to supply their own API keys. But someone must supply the computation or accept limits.

A small paid operator budget may be less expensive than expected, but it is not zero. Groq currently lists GPT-OSS 120B at $0.15 per million input tokens and $0.60 per million output tokens. [Groq model pricing](https://console.groq.com/docs/models)

**Illustrative arithmetic:** 50,000 input plus 10,000 billable output tokens per day, for 30 days, would be approximately $0.405 in input/output charges at those rates. At 100 equally active users, approximately $40.50. This excludes hosting, database, retries, tools, taxes, and any additional billable generation not included in the assumed output. It is not a forecast or quote for Memex.

The point is not to force a paid plan: measure the real requirement and compare it with the cost of aggressively restricting functionality. Do not degrade confidentiality or silently miss important emails merely to preserve a zero-dollar headline.

## 8. Priorities and Acceptance Criteria

### First: visibility and admission

Measure per feature and task: prompt tokens, generated tokens, cached/reasoning tokens when available, model calls, retries, latency, error category, queue age, and provider limit/reset signals. Record opaque user/task identifiers, not raw mail or prompts.

Require all features to participate in shared admission and fair scheduling. Distinguish waiting for a minute allowance from waiting for a daily reset.

### Second: trustworthy retrieval and reuse

Remove newest-100/top-three assumptions from any promise of complete review. Add source coverage, body-aware retrieval, versioned facts, on-demand replies, and explicit current message/draft state. Preserve local, zero-inference answers.

### Third: evidence-based optimization

Benchmark model/effort/batch settings on synthetic or appropriately authorized data. Include vague subjects, important instructions in the middle/end, long quoted threads, attachments, non-English text, conflicting dates, archived mail, and multiple accounts.

Compare against a more thorough reference workflow. Count missed critical items, incorrect recipients, unsupported claims, and user corrections. Report token savings only alongside these quality metrics.

### Fourth: controlled load and failure testing

Test a normal daily mailbox, a historical backfill, and several users acting concurrently. Include cold caches, worker restarts, provider 429/5xx, network timeouts, daily exhaustion, and cancelled tasks.

Acceptance conditions should include:

- Exact counts/time filters remain correct without AI when sync coverage is known.
- No false claim of complete analysis while messages remain unexamined.
- Interactive capacity is protected during backfill.
- Daily exhaustion does not create an automatic retry storm.
- Work resumes without duplicate analysis where deduplication applies.
- No unauthorized send and no retry-based duplicate delivery in tested workflows.
- Cached results never cross user boundaries; deletion removes covered derivatives.
- Quality regression is evaluated explicitly, especially missed urgent requests.
- Tokens per completed task and wait-time percentiles are measured, not guessed.

Specific latency and recall targets should be set from the intended workload and reference dataset. Passing mocked API tests alone does not demonstrate those product properties.

## Conclusion and Remaining Unknowns

The main correction is conceptual: **mailbox size is not the same as AI workload**. Memex already has useful selective processing, but its budget control and completeness guarantees are not yet coherent across the whole application.

The practical path is to finish those shared policies, not merely add more API keys, a larger context window, more agents, or stricter truncation.

Unresolved facts: the exact current provider/account quotas and settings; the actual error headers for the reported event; token consumption by feature; simultaneous user demand; deployed worker cadence; cache-hit behavior; and measured retrieval quality. Competitors' private infrastructure bills and contracts are also unknown.

This report identifies a broad set of predictable failure classes. It does not prove that every possible future AI-integration problem has been discovered, or that any proposed changes have been implemented.
