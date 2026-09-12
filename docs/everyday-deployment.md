# Everyday Personal Deployment (no credit card)

The free way to run Memex as your **personal, everyday app** — email + AI
chat daily, notes sometimes — without entering a payment method anywhere.

The stack is Vercel Hobby (hosting) + Neon (Postgres) + cron-job.org
(scheduled jobs) + a free Gemini key. It is the same stack as the portfolio
demo in [free-deployment.md](free-deployment.md), but **deployed twice with
two separate Neon databases**: one private instance for you, one clean
seeded instance for the public demo. Separation lives in the database —
demo visitors can never see your emails.

Honest limits for one daily user (they are manageable, know them up front):

- **Database size**: Neon free is ~0.5 GB. Notes/chunks will never get close;
  years of bulk email ingestion might. Check usage in the Neon console.
- **AI quota**: Gemini/Groq free daily request caps. The app's built-in AI
  budget controls keep background email analysis from starving your chat.
- **Email sync duration**: serverless functions cap at ~5 minutes. The first
  sync of a large mailbox may need a second click; after that, syncs are
  incremental and fast.
- **Cron**: Vercel Hobby only allows once-daily Vercel Cron, so the
  every-10-minute trigger comes from cron-job.org instead (Step 4).

If you ever accept a one-time card *check* (nothing charged), the stronger
option is a real always-on VM: [oracle-vm-deployment.md](oracle-vm-deployment.md).

---

## Instance 1 — your personal app

### Step 1 — Database

Create a Neon project named `memex-personal` (region: US East — free app
hosting runs there, so keep the database next to it). Copy the **direct**
connection string (host without `-pooler`), then from your PC:

```bash
npm run db:use-postgres
DATABASE_URL="<neon-direct-string>" npx prisma db push
npm run db:use-sqlite   # put local dev back on SQLite
```

### Step 2 — Vercel project

1. [vercel.com/new](https://vercel.com/new) → import `SarthakEpic/Memex`
   (name it something like `memex-personal` so the URL is memorable).
2. Add environment variables (Vercel → Project → Settings → Environment
   Variables):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the `memex-personal` Neon direct string |
   | `ENCRYPTION_KEY` | your generated 32+ char key |
   | `APP_BASE_URL` | `https://memex-personal.vercel.app` (your actual URL — deploy once to see it, then set this and redeploy) |
   | `RATE_LIMIT_BACKEND` | `database` |
   | `AI_PROVIDER` | `gemini` |
   | `GEMINI_API_KEY` | your Gemini key |
   | `CRON_SECRET` | a long random string |

   Build settings need nothing manual — `vercel.json` pins them (the build
   switches to the Postgres schema and pushes the tables automatically).

3. Deploy. Verify `https://<your-url>/api/health` → `{"ok":true,...}`, then
   create your account.

### Step 3 — Connect Gmail

Google Account → Security → enable **2-Step Verification** → **App
passwords** → create one. In Memex: Settings → Email → connect via the
**IMAP/advanced** path with that app password (avoids Google's OAuth
verification entirely). Details: [email-oauth-setup.md](email-oauth-setup.md).

### Step 4 — Cron (every 10 minutes)

[cron-job.org](https://cron-job.org) → Create cronjob:

- URL: `https://<your-url>/api/cron/scheduled`
- Schedule: every 10 minutes (`*/10 * * * *`)
- Advanced → header: `Authorization` = `Bearer <your CRON_SECRET>`

Confirm HTTP 200 in its execution history. This processes scheduled emails,
digests, and token cleanup.

## Instance 2 — the public demo (later, ~15 min)

Repeat with a **second** Neon project (`memex-demo`) and a second Vercel
project, using **different** `ENCRYPTION_KEY` and `CRON_SECRET` values.
Then sign up on it and seed the walkthrough data:

```bash
DATABASE_URL="<memex-demo-neon-string>" node --no-warnings scripts/seed-presentation.mjs --email=<email-you-signed-up-with>
```

Add the demo URL to the README intro and you are portfolio-ready.

## Updating

`git push` — both Vercel projects redeploy automatically. Schema changed?
Repeat Step 1's two commands against each project.
