# AI Capacity Operations

Memex treats hosted AI as a limited dependency. Core inbox search, filtering,
sync, editing, and confirmed email delivery continue to use application code and
the database; the model is reserved for interpretation, selective analysis, and
writing.

## Runtime Policy

- Every chat completion is admitted through one shared provider/model budget.
- Interactive work and background work have separate daily capacity controls.
- Requests are also bounded per user so one account cannot consume the shared
  daily allowance.
- Identical in-flight requests are deduplicated in each server process.
- Provider retries are disabled. Retrying a large request invisibly wastes quota
  and makes failures slow; callers receive a typed error and retry time instead.
- Rate-limited queue jobs are deferred until capacity returns without consuming
  their permanent failure attempts.
- Inbox review ranks headers and saved analysis locally, then reads at most three
  selected bodies. Long bodies are reduced to query-relevant passages plus their
  opening and closing context.
- Background classification never generates speculative reply drafts. Drafting
  happens only after an explicit user request.

## Configuration

The defaults are intentionally conservative for Groq. Limits vary by model and
account, so values shown in the provider dashboard take precedence.

```dotenv
AI_BUDGET_ENABLED="true"
AI_BUDGET_RPM="30"
AI_BUDGET_RPD="1000"
AI_BUDGET_TPM="8000"
AI_BUDGET_TPD="200000"
AI_BUDGET_SAFETY_PERCENT="10"
AI_BUDGET_BACKGROUND_TPD="40000"
AI_BUDGET_PER_USER_TPD="180000"
```

For providers other than Groq, Memex does not guess a quota. Set explicit budget
values to enable admission control. Keep a safety reserve so provider-side token
counting differences do not cause preventable 429 responses.

The Settings page shows the current per-user and shared daily token ledgers.
Counts are conservative reservations reconciled with provider-reported usage;
they are not billing records.

## Failure Behavior

- `budget_exhausted`: wait until the shown reset time or reduce the configured
  background allocation. Non-AI features remain available.
- `rate_limited`: use the provider reset time when supplied. Memex stores a
  shared cooldown and does not launch an application retry storm.
- `timeout`: the provider did not answer before the request deadline. The action
  is not reported as completed.
- `configuration`: verify API key, model, endpoint, scopes, and provider status.
- `invalid_request`: check model compatibility or reduce request size.

Operational logs contain provider/model, feature name, work class, durations,
token counts, and error codes. They do not contain prompts, email text, note text,
email addresses, or user identifiers.

## Validation

Run the same sequence used by CI:

```powershell
npm run ci
```

This regenerates Prisma, initializes the development database, runs lint,
typechecking and unit tests, creates a production build, and exercises the
authenticated standalone server with a smoke test. The smoke test never supplies
a sending account and asserts that real delivery is refused.
