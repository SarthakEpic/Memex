# Hugging Face Spaces Deployment (no credit card, free)

This is the **card-free** way to run Memex as a personal, always-on app. Every
service in this guide is free and asks for nothing but an email address:

| Piece          | Service                          | Card required |
| -------------- | -------------------------------- | ------------- |
| App hosting    | Hugging Face Space (Docker)      | No            |
| Database       | Neon free Postgres               | No            |
| Scheduled jobs | cron-job.org                     | No            |
| AI             | Gemini free API key              | No            |

What you get: 2 vCPU / 16 GB RAM, HTTPS on a `hf.space` URL, no serverless
timeouts, and your data in a real Postgres database.

Trade-offs to know:

- **Sleep**: free Spaces sleep after 48 h without requests. The 10-minute cron
  (Step 5) counts as activity, so while it's configured the app stays warm.
  If it ever does sleep, opening the URL wakes it in under a minute.
- **Storage**: the Space has no persistent disk — that's why the database
  lives in Neon. The Space itself is stateless, which also means updates are
  just `git push`.
- **Visibility**: the Space is public, so its source code is visible (it's
  already public on GitHub) — but your data is not: Memex requires login and
  all secrets live in Space/Neon settings, never in the code.

The Oracle VM guide ([oracle-vm-deployment.md](oracle-vm-deployment.md))
remains the alternative if you ever accept a card check: it buys you a
private box with no sleep and no third-party limits.

---

## Step 1 — Accounts

1. [huggingface.co](https://huggingface.co) → sign up (email only).
2. [neon.tech](https://neon.tech) → sign up, create a project (e.g. `memex-personal`).
3. [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → create a Gemini API key.
4. [cron-job.org](https://cron-job.org) → sign up.

## Step 2 — Create the Neon database schema

From your PC, one time (and again after any schema-changing update):

```bash
npm run db:use-postgres
DATABASE_URL="postgresql://<neon-direct-connection-string>" npx prisma db push
```

Use Neon's **direct** connection string (host without `-pooler`).

## Step 3 — Create the Space

1. On Hugging Face: **New → Space** → name it `memex`.
2. SDK: **Docker** → **Blank** → Public → Create.
3. Note the Space id: `<your-username>/memex`.

## Step 4 — Connect GitHub to the Space

1. HF token: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
   → New token → type **Write** → copy it.
2. On GitHub, in your repo: **Settings → Secrets and variables → Actions**:
   - **Variables** tab → new variable `HF_SPACE_ID` = `<your-username>/memex`
   - **Secrets** tab → new secret `HF_TOKEN` = the token from above

The `hf-sync` workflow now mirrors every push to `main` into the Space
automatically (it injects the Space README frontmatter, so the GitHub README
stays clean). Push anything — or use **Actions → Sync to Hugging Face Space
→ Run workflow** — and the Space will build (~5 minutes for the first build).

## Step 5 — Configure the Space

Space → **Settings → Variables and secrets** — add all of these as *secrets*
(values are private; they are never exposed in code or logs):

| Name                | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`      | your Neon **direct** connection string                        |
| `ENCRYPTION_KEY`    | your generated 32+ char key                                   |
| `APP_BASE_URL`      | `https://<your-username>-memex.hf.space`                      |
| `RATE_LIMIT_BACKEND`| `database`                                                    |
| `AI_PROVIDER`       | `gemini`                                                      |
| `GEMINI_API_KEY`    | your Gemini key                                               |
| `CRON_SECRET`       | a long random string                                          |

Adding secrets restarts the Space. Verify: open
`https://<your-username>-memex.hf.space/api/health` → `{"ok":true,...}`.

## Step 6 — Cron

cron-job.org → Create cronjob:

- URL: `https://<your-username>-memex.hf.space/api/cron/scheduled`
- Schedule: every 10 minutes
- Advanced → HTTP header: `Authorization` = `Bearer <your CRON_SECRET>`

This processes scheduled emails, digests, and token cleanup — and doubles as
a keep-alive for the Space.

## Step 7 — Connect Gmail

Google Account → Security → turn on **2-Step Verification** → **App passwords**
→ create one. Then in Memex: Settings → Email → connect via the **IMAP /
advanced** path with that app password (avoids Google OAuth verification
entirely). Full OAuth setup, if you ever prefer it:
[email-oauth-setup.md](email-oauth-setup.md).

## Updating

```bash
git push          # to GitHub — the workflow mirrors it to the Space
```

Schema changed too? Repeat Step 2.

## Troubleshooting

- **Space stuck "Building"** → Space page → **Logs** tab shows the Docker
  build output. Most failures are a typo in a Space secret.
- **502 / app sleeps on open** → first request after a wake needs ~1 minute;
  refresh.
- **Cron returns 401** → the header secret must exactly match `CRON_SECRET`
  in the Space settings.
- **`/api/inbox/refresh` cuts off mid-sync** → the HF proxy limits very long
  requests; sync in smaller batches or retry — the app resumes safely.
