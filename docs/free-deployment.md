# Free Deployment Guide

This guide is for a zero-cost portfolio deployment. Free tiers can change, so
verify limits before you depend on them for real users.

## Recommended Free Stack

- Hosting: Vercel Hobby (or any free Docker host — see the Docker section below)
- Database: Neon Free Postgres
- CI: GitHub Actions
- AI: Gemini free API key, Groq free API key, OpenRouter free model, or local Ollama for local-only demos
- Scheduled jobs: an external free cron (cron-job.org) on Vercel Hobby — Hobby only allows once-per-day Vercel Crons

## What This Deploy Supports

- Multi-user signup/login with HttpOnly session cookies.
- User-scoped notes, chunks, decisions, chats, inbox, emails, templates, and profile.
- Password reset and email verification code paths.
- Scheduled email/digest processing through `/api/cron/scheduled`.
- Health checks through `/api/health`.

## What You Must Do Yourself

- Create accounts on GitHub, Vercel, Neon, and your chosen AI provider.
- Add environment variables in Vercel.
- Create the Neon database and copy its Postgres connection string.
- Configure a real platform SMTP account if you set `REQUIRE_EMAIL_VERIFICATION=true`.
- Add screenshots/demo video/live URL to the portfolio README when you are ready.

## Step 1: Push To GitHub

Make sure these files are not committed:

- `.env`
- `.next/`
- `node_modules/`
- `prisma/db/*.db`
- `PROJECT_MEMORY.md`

Then push the repository to GitHub.

## Step 2: Create A Free Neon Database

1. Go to Neon and create a free project.
2. Copy the **direct** (non-pooled) Postgres connection string — the one
   WITHOUT `-pooler` in the host name. The direct string is required for
   `prisma db push` during the build and works fine for the app at runtime.
3. Keep the database small. The free tier is enough for a portfolio demo, not heavy public usage.

## Step 3: Create The Vercel Project

1. Import the GitHub repo in Vercel.
2. Framework preset: Next.js (auto-detected).
3. Install command and build command are already configured in `vercel.json`
   — no manual build settings needed. The build switches to the Postgres
   Prisma schema (picked automatically from `DATABASE_URL`), pushes the
   tables to Neon, and builds the app.

Or skip the dashboard entirely with the **Deploy** button in the README —
it clones the repo into a fresh Vercel project and prompts you for the
environment variables.

> Running Memex as your personal everyday app? A small always-on VM gives
> you email ingestion and AI chat without serverless timeouts — see
> [oracle-vm-deployment.md](oracle-vm-deployment.md) for the free Oracle
> Cloud path (Docker Compose + automatic HTTPS + built-in scheduler).

## Step 4: Add Vercel Environment Variables

Minimum:

```txt
DATABASE_URL=postgresql://...
ENCRYPTION_KEY=<32+ random chars>
APP_BASE_URL=https://your-vercel-url.vercel.app
RATE_LIMIT_BACKEND=database
AI_PROVIDER=gemini
GEMINI_API_KEY=<your key>
```

Recommended:

```txt
REQUIRE_EMAIL_VERIFICATION=false
CRON_SECRET=
```

Set `REQUIRE_EMAIL_VERIFICATION=true` only after adding platform SMTP:

```txt
APP_EMAIL_FROM=Memex <no-reply@your-domain.com>
AUTH_SMTP_HOST=smtp.example.com
AUTH_SMTP_PORT=587
AUTH_SMTP_USER=...
AUTH_SMTP_PASSWORD=...
AUTH_SMTP_SECURE=false
```

Generate a strong encryption key locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Step 5: Deploy

Deploy from Vercel. After deployment:

1. Open `/api/health`.
2. Create a test account.
3. Add one note.
4. Ask a chat question.
5. Check Vercel logs if anything fails.

## Step 6: Scheduled Jobs

The scheduled route `/api/cron/scheduled` processes:

- due scheduled emails
- daily digests
- expired auth tokens

**Vercel Hobby limitation:** Hobby projects can only run Vercel Cron once per
day, so the `*/10 * * * *` schedule in `vercel.json` will not fire every ten
minutes there. Two options:

1. **External free cron (recommended for Hobby).** Set `CRON_SECRET` in
   Vercel, create a free cron-job.org job that every 10 minutes calls:

   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/cron/scheduled
   ```

   cron-job.org supports custom request headers in the job's "Advanced" settings.

2. **Paid/Pro Vercel or self-hosted Docker** — then the built-in
   `vercel.json` cron (or your platform's scheduler) runs every 10 minutes.

## Alternative: Any Free Docker Host (Railway, Koyeb, Render, Fly.io, a VPS)

A `Dockerfile` is included, so the app also deploys anywhere that runs
containers. It builds the standalone Next.js output with the Postgres Prisma
schema and serves it on the platform-assigned `PORT`.

1. Create a free Postgres database (Neon works here too) and run the schema
   once from your machine:

   ```bash
   DATABASE_URL="postgresql://..." npm run db:use-postgres && npx prisma db push
   ```

2. Push the repo to the platform with these environment variables:
   `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_BASE_URL` (the platform's public
   HTTPS URL), `RATE_LIMIT_BACKEND=database`, and your AI provider key(s).
3. Point a health check at `/api/health` if the platform supports one.
4. Scheduled jobs: use the platform's scheduler or cron-job.org with
   `CRON_SECRET`, as in Step 6.

For a SQLite build instead, pass `--build-arg PRISMA_PROVIDER=sqlite` and run
with `DATABASE_URL=file:./db/custom.db` on a persistent volume.

## Free-Tier Reality Check

- Free hosting and database tiers are enough for a portfolio demo.
- Free tiers are not a guarantee for unlimited users.
- Production email verification/password reset requires a real SMTP provider.
- Vercel Hobby runtime logs are short-lived, so save important deployment notes yourself.
- For a serious public SaaS, add paid backups, log retention, domain email, and monitoring.
