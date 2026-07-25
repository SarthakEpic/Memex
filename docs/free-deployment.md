# Free Deployment Guide

This guide is for a zero-cost portfolio deployment. Free tiers can change, so
verify limits before you depend on them for real users.

## Recommended Free Stack

- Hosting: Vercel Hobby
- Database: Neon Free Postgres
- CI: GitHub Actions
- AI: Gemini free API key, Groq free API key, OpenRouter free model, or local Ollama for local-only demos
- Scheduled jobs: Vercel Cron from `vercel.json`

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
2. Copy the pooled Postgres connection string.
3. Keep the database small. The free tier is enough for a portfolio demo, not heavy public usage.

## Step 3: Create The Vercel Project

1. Import the GitHub repo in Vercel.
2. Framework preset: Next.js.
3. Install command: `npm install`
4. Build command:

```bash
npm run db:use-postgres && npx prisma db push && npm run build
```

That command switches the ephemeral Vercel build to the Postgres Prisma schema,
pushes tables to Neon, and builds the app.

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

`vercel.json` runs:

```txt
/api/cron/scheduled every 10 minutes
```

This processes:

- due scheduled emails
- daily digests
- expired auth tokens

For stricter security with an external cron caller, set `CRON_SECRET` and call:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/cron/scheduled
```

## Free-Tier Reality Check

- Free hosting and database tiers are enough for a portfolio demo.
- Free tiers are not a guarantee for unlimited users.
- Production email verification/password reset requires a real SMTP provider.
- Vercel Hobby runtime logs are short-lived, so save important deployment notes yourself.
- For a serious public SaaS, add paid backups, log retention, domain email, and monitoring.
