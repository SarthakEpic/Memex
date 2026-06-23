# 🧠 Memex — Citation-First Knowledge + Email Management System

> Every claim in a chat answer is hyperlinked to its source chunk — or the model honestly says it can't cite one.

Memex is a comprehensive AI-powered personal knowledge management system that combines:
- 📝 **Markdown notes** with smart chunking for precise citation
- 💬 **Multi-mode AI chat** that cites sources, drafts emails, and helps with app questions
- 📧 **Email management** — connect your inbox, get AI categorization, summaries, and reply drafts
- 🎯 **Decision extraction** — AI automatically pulls decisions out of your notes
- 🔍 **BM25 keyword retrieval** (no vector database needed)

---

## 📋 Table of Contents

1. [Features](#-features)
2. [Tech Stack](#-tech-stack)
3. [Architecture](#-architecture)
4. [Quick Start (5 minutes)](#-quick-start-5-minutes)
5. [User Manual](#-user-manual)
6. [AI Provider Configuration](#-ai-provider-configuration)
7. [Database Configuration](#-database-configuration-sqlite--postgresql)
8. [Deployment Guide](#-deployment-guide)
9. [Project Structure](#-project-structure)
10. [API Reference](#-api-reference)
11. [Troubleshooting](#-troubleshooting)
12. [Uploading to GitHub](#-uploading-to-github)
13. [License](#-license)

---

## ✨ Features

### 📝 Notes Section
- **Write manually** with live Markdown preview (Edit/Split toggle)
- **Import from URL** — paste any web page URL, the app fetches and converts to Markdown
- **Upload files** — PDF, Word (.docx), PowerPoint (.pptx), TXT, Markdown
- **Audio to Note** — speak in English or Hindi (Hindi becomes Hinglish), AI transcribes + structures
- **Quick start templates** — Decision, Meeting, Blank
- **Smart chunking** — notes are split by H2 headings (~512 tokens per chunk) for precise citation
- **AI decision extraction** — automatically finds "We chose X because Y" statements
- **Pin, filter, duplicate, bulk select** notes
- **Table of contents** auto-generated from headings
- **Export** all notes as Markdown

### 💬 Chat Section (Smart Assistant)
- **Multi-mode intent detection**:
  - 📚 Note Q&A — citation-first answers from your notes
  - ❓ App Help — knows everything about Memex
  - 💬 General conversation — greetings, casual chat, general knowledge
  - 📧 Email Help — inbox management guidance
- **Interactive EmailDraftCard** — when you ask to send an email, the AI drafts it and shows a preview card with:
  - Recipient, Subject, Body (Markdown-rendered)
  - Inline editing for each field
  - Auto-subject generation (updates subject from body content)
  - Action buttons: Send, Schedule, Regenerate (with feedback), Save Draft, Cancel
  - Status indicators: Draft Created → Sending → Sent → Failed → Scheduled
  - Expandable timeline of all actions
- **Citation pills** [^chunkId] are clickable — opens the source chunk
- **Chat sessions** — rename, delete, A/B compare two sessions
- **In-session search** (Find button)
- **Keyboard shortcut** `/` to focus input
- **Resizable sidebar** (drag the border)
- **Export** chat as Markdown

### 🎯 Decisions Section
- AI-extracted from notes automatically
- Each decision has: title, rationale, alternatives, confidence score, source chunk
- Filter by confidence slider, search, pin important decisions
- Copy as quote (markdown blockquote)
- Click any decision to see the source chunk it came from

### 📅 Timeline Section
- Notes and decisions interleaved chronologically
- Filter by date range, by project
- Click events to open source

### 📊 Analytics Section
- Most-cited chunks (which notes the AI references most)
- Question activity chart (14 days)
- Project distribution
- Export as CSV or JSON

### 📬 Smart Inbox Section
- **Connect your email account** (Gmail, Outlook, Yahoo, iCloud)
- For Gmail: use an App Password (not your regular password)
- **IMAP sync** — reads real emails from your inbox + sent folder
- **AI categorization** — each email is tagged:
  - 🔴 Urgent (needs immediate action)
  - 🟡 Important (needs response)
  - ⚪ Normal
  - 📰 Newsletter
  - 🚫 Spam
- **AI summary** + key points for each email
- **AI reply drafts** for emails that need responses
- **AI Reply Generator** — type an instruction ("accept and suggest Tuesday") → AI drafts the reply
- **Daily Email Briefing** — one-click AI summary of today's important emails
- **Convert any email to a note** with one click
- **Search** inbox by sender/subject/body
- **Thread view** — group emails by conversation
- **Star, archive, mark read/unread**
- **Browser notifications** for urgent emails

### 📤 Sent Section
- All emails sent from Memex (composed, chat answers, decision briefs, digests)
- **Schedule emails** for future delivery
- Status pipeline: queued → scheduled → delivered
- **Email templates** — Daily Digest, Decision Brief, Source Snapshot
- **Real SMTP sending** when SMTP credentials are configured (via nodemailer)
- Without SMTP, emails are saved locally (simulated delivery)

### ⚙️ Settings Section
- Profile: name, email, SMTP settings
- Daily digest: enable/disable, set hour
- **AI Provider status** — shows which LLM backend is configured
- **Security & Privacy**:
  - Local storage indicator (all data on your device)
  - LLM privacy mode (only relevant snippets sent to AI)
  - Data encryption indicator
  - **Erase all data** (Danger Zone — type "ERASE ALL DATA" to confirm)
- Dark mode toggle
- Shield icon in sidebar shows data is encrypted locally

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Command palette (search notes, decisions, navigate, actions) |
| `?` | Show shortcuts help |
| `/` | Focus chat input (when on Chat section) |
| `Esc` | Close dialog/panel |
| `Enter` | Send chat message |
| `Shift+Enter` | New line in chat |

---

## 🛠 Tech Stack

### Core Framework
- **[Next.js 16](https://nextjs.org/)** with App Router (Turbopack)
- **[TypeScript 5](https://www.typescriptlang.org/)**
- **[Tailwind CSS 4](https://tailwindcss.com/)** with **[shadcn/ui](https://ui.shadcn.com/)** (New York style)

### Database
- **[Prisma ORM](https://www.prisma.io/)** with **SQLite** (local dev) or **PostgreSQL** (production)
- Switch between them with one command: `bun run db:use-postgres` / `bun run db:use-sqlite`

### AI / LLM
- **[OpenAI SDK](https://www.npmjs.com/package/openai)** as universal client (OpenAI-compatible API format)
- Supports multiple providers (all have free tiers):
  - **Google Gemini** (default — 1500 requests/day free)
  - **Groq** (fastest — Llama 3.3 70B, free)
  - **OpenRouter** (aggregator with free models)
  - **OpenAI** (paid, best quality)
  - **Ollama** (100% free, local, unlimited)
  - Any OpenAI-compatible custom provider

### State Management & Data Fetching
- **[Zustand](https://github.com/pmndrs/zustand)** for client state
- **[TanStack Query](https://tanstack.com/query/latest)** for server state

### Email
- **[nodemailer](https://nodemailer.com/)** for SMTP sending
- **[imapflow](https://imapflow.com/)** for IMAP receiving

### File Processing
- **[pdf-parse](https://www.npmjs.com/package/pdf-parse)** for PDF text extraction
- **[mammoth](https://www.npmjs.com/package/mammoth)** for Word (.docx) extraction
- **[jszip](https://www.npmjs.com/package/jszip)** for PowerPoint (.pptx) extraction

### Markdown
- **[react-markdown](https://github.com/remarkjs/react-markdown)** with **[remark-gfm](https://github.com/remarkjs/remark-gfm)**
- Custom renderer with Memex-styled elements

### Icons & UI
- **[Lucide React](https://lucide.dev/)** icons
- **[Sonner](https://sonner.emilkowal.ski/)** for toast notifications
- **[Framer Motion](https://www.framer.com/motion/)** for animations

### Runtime
- **[Bun](https://bun.sh/)** as the JavaScript runtime and package manager

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  React UI   │  │  Zustand    │  │  TanStack Query         │ │
│  │  (shadcn)   │  │  (state)    │  │  (server state cache)   │ │
│  └──────┬──────┘  └─────────────┘  └────────────┬────────────┘ │
└─────────┼────────────────────────────────────────┼──────────────┘
          │  fetch()                                │
┌─────────▼────────────────────────────────────────▼──────────────┐
│                    Next.js 16 API Routes                         │
│  /api/chat    /api/notes    /api/inbox    /api/emails    etc.   │
└─────────┬────────────────────────────────────────┬──────────────┘
          │                                        │
          │                                        │
┌─────────▼──────────────┐         ┌──────────────▼──────────────┐
│   AI Provider Layer    │         │      Prisma ORM             │
│   (src/lib/ai-client)  │         │      (src/lib/db)           │
│                        │         │                             │
│  ┌─ Gemini ──────────┐ │         │  ┌─ SQLite (dev) ────────┐  │
│  ├─ Groq ───────────┤ │         │  ├─ PostgreSQL (prod) ──┤  │
│  ├─ OpenAI ─────────┤ │         │  └──────────────────────┘  │
│  ├─ Ollama ─────────┤ │         └─────────────────────────────┘
│  ├─ OpenRouter ─────┤ │
│  └─ Sandbox (fallback)│
└─────────┬───────────────┘
          │
          ▼
    External LLM API
    (Google / Groq / OpenAI / local Ollama)
```

### Key Design Decisions

1. **Citation-first** — every factual claim in a chat answer cites a source chunk via `[^chunkId]`. If no source exists, the model says "I don't have a source for this."

2. **BM25 retrieval instead of vector search** — no embedding API or vector database needed. TF-IDF keyword matching + optional LLM reranking keeps the system simple and dependency-free.

3. **Multi-provider AI abstraction** — one code path (`chatComplete()`) works with any OpenAI-compatible provider. Switch providers by changing one env var.

4. **Sandbox fallback** — if no AI provider is configured, the app automatically uses the sandbox's built-in AI (only works in the development sandbox).

5. **SQLite for dev, PostgreSQL for prod** — identical schemas, switch with one command. No code changes needed.

---

## 🚀 Quick Start (5 minutes)

### Prerequisites
- **[Bun](https://bun.sh/)** installed (or Node.js 18+ with npm)
- A free AI provider API key (recommended: **Google Gemini** — [get one here](https://aistudio.google.com/app/apikey))

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/memex.git
cd memex

# 2. Install dependencies
bun install

# 3. Copy the environment template
cp .env.example .env

# 4. Edit .env and add your AI provider key
#    (At minimum, set AI_PROVIDER and GEMINI_API_KEY)
nano .env

# 5. Initialize the database
bun run db:push

# 6. Start the development server
bun run dev
```

Open **http://localhost:3000** in your browser. You're done! 🎉

> **Note:** If you skip step 4 (no AI key), the app will still run but AI features won't work. The Settings page will show you exactly what to configure.

---

## 📖 User Manual

### Adding Notes

1. **Write manually**: Click the "Add" button in Notes → "Write manually". Use the split-view editor with live Markdown preview. Quick-start templates available (Decision, Meeting, Blank).

2. **Import from URL**: Click "Add" → "Import URL". Paste any web page URL. The app fetches the page, converts HTML to Markdown, and ingests it.

3. **Upload a file**: Click "Add" → "Upload file". Supports PDF, Word (.docx), PowerPoint (.pptx), TXT, Markdown. Text is extracted and structured.

4. **Audio to Note**: Click "Add" → "Audio to note". Record your voice (English or Hindi). AI transcribes it and structures it into a clean Markdown note. Hindi speech becomes Hinglish (Hindi in Roman script).

### Asking Questions

Go to the **Chat** section and type your question. The AI automatically detects what you're asking:
- **Note questions** (e.g., "Why did we pick Postgres?") → answers with citations `[^chunkId]`
- **App questions** (e.g., "How do I add a note?") → helpful guidance
- **General chat** (e.g., "Hi", "Thanks") → friendly conversation
- **Email requests** (e.g., "Send an email to John about the meeting") → interactive email draft card

### Sending Emails via Chat

1. Type something like: "send an email to john@example.com about the project meeting tomorrow"
2. An **EmailDraftCard** appears with the drafted email (recipient, subject, body)
3. **Edit any field** by clicking the "Edit" button next to it
4. Click **Send Email** to send immediately, or **Schedule** to send later
5. Click **Regenerate** and type feedback ("make it shorter") to get a new draft
6. The **timeline** at the bottom shows every action taken

### Managing Your Inbox

1. Go to **Smart Inbox** → click **Connect Account**
2. Enter your email address and an App Password (for Gmail: [get one here](https://myaccount.google.com/apppasswords))
3. Click **Sync** to fetch emails
4. AI automatically categorizes each email (urgent, important, normal, newsletter, spam)
5. Click any email to see the AI summary, key points, and suggested reply
6. Use the **Briefing** button for a one-click AI summary of today's important emails

### Extracting Decisions

Decisions are extracted automatically when you add notes. Go to the **Decisions** section to:
- Filter by confidence score
- Search and pin important decisions
- Click any decision to see its source chunk
- Copy as a markdown blockquote

### Keyboard Shortcuts

- Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) to open the **command palette**
- Press `?` to see all keyboard shortcuts
- Press `/` on the Chat page to focus the input

---

## 🤖 AI Provider Configuration

Memex supports multiple AI providers. Choose one based on your needs:

### Provider Comparison

| Provider | Free Tier | Speed | Quality | Setup Difficulty |
|----------|-----------|-------|---------|------------------|
| **Google Gemini** ⭐ | 1500 req/day | Fast | High | Easy |
| **Groq** | ~1000 req/day | Fastest | High | Easy |
| **OpenRouter** | Free models available | Varies | Varies | Easy |
| **Ollama** | Unlimited (local) | Depends on hardware | Good | Medium |
| **OpenAI** | Paid ($0.15/1M tokens) | Fast | Highest | Easy |

### Setup Instructions

#### Google Gemini (Recommended — most generous free tier)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key
4. Add to your `.env`:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=AIzaSy...your-key...
   ```

#### Groq (Fastest — great for chat)

1. Go to [Groq Console](https://console.groq.com/keys)
2. Create an account and generate an API key
3. Add to your `.env`:
   ```
   AI_PROVIDER=groq
   GROQ_API_KEY=gsk_...your-key...
   ```

#### Ollama (100% free, local, unlimited)

1. Install [Ollama](https://ollama.ai)
2. Open a terminal and pull a model:
   ```bash
   ollama pull llama3.1:8b
   ```
3. Add to your `.env`:
   ```
   AI_PROVIDER=ollama
   OLLAMA_HOST=http://localhost:11434
   ```
4. Note: You need a decent CPU/GPU for local inference. The `llama3.1:8b` model needs ~6GB RAM.

#### OpenAI (Paid — best quality)

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an API key (requires payment method)
3. Add to your `.env`:
   ```
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-...your-key...
   ```

### Checking Provider Status

Go to **Settings** → **AI Provider** section. The app shows:
- Which provider is active
- Which model is being used
- Whether it's properly configured
- Step-by-step fix instructions if something is missing

### Switching Providers

Just change `AI_PROVIDER` in your `.env` file and restart the server. No code changes needed.

### Audio Transcription (ASR)

The audio-to-note feature requires a speech-to-text service:
- **Groq** — free Whisper Large v3 Turbo transcription
- **OpenAI** — paid Whisper API ($0.006/min)
- **Gemini / Ollama** — not supported (the app will show an error message guiding you to switch)

### Custom Provider

Any OpenAI-compatible API works:
```
AI_PROVIDER=custom
AI_BASE_URL=https://your-provider.com/v1
AI_API_KEY=your-key
AI_MODEL=your-model-name
```

---

## 🗄 Database Configuration (SQLite / PostgreSQL)

Memex supports both SQLite (for local development) and PostgreSQL (for production). The schemas are identical — only the connection string and provider change.

### SQLite (Default — Local Development)

No setup needed. The database file is created automatically at `db/custom.db`.

Your `.env`:
```
DATABASE_URL="file:./db/custom.db"
```

### PostgreSQL (Production / Cloud Deployment)

1. **Switch the schema**:
   ```bash
   bun run db:use-postgres
   ```

2. **Set the connection string** in your `.env`:
   ```
   DATABASE_URL="postgresql://user:password@host:5432/memex"
   ```

3. **Push the schema to create tables**:
   ```bash
   bun run db:push
   ```

#### Getting a Free PostgreSQL Database

- **[Neon](https://neon.tech/)** — 0.5GB free, serverless, instant setup
- **[Supabase](https://supabase.com/)** — 500MB free, includes auth
- **[Railway](https://railway.app/)** — $5 free credit, simple setup
- **[Render](https://render.com/)** — 90 days free PostgreSQL

#### Switching Back to SQLite

```bash
bun run db:use-sqlite
```

---

## 🚢 Deployment Guide

### Option 1: Vercel (Recommended for easy deployment)

> Note: Vercel's filesystem is read-only, so you MUST use PostgreSQL (not SQLite).

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → Import your repo
3. Add environment variables:
   - `DATABASE_URL` — your PostgreSQL connection string
   - `AI_PROVIDER` — `gemini` (or your choice)
   - `GEMINI_API_KEY` — your API key
4. Deploy
5. Run `bun run db:push` once (via Vercel's terminal or locally with the same DATABASE_URL)

### Option 2: Railway

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a PostgreSQL database add-on
4. Set environment variables (same as Vercel)
5. Railway automatically runs `bun install` and `bun run build`

### Option 3: Your Own VPS (DigitalOcean, Hetzner, AWS EC2)

```bash
# On your server:
git clone https://github.com/YOUR_USERNAME/memex.git
cd memex
bun install
cp .env.example .env
# Edit .env with your settings
bun run db:use-postgres  # if using PostgreSQL
bun run db:push
bun run build
bun run start   # starts production server on port 3000

# Use PM2 to keep it running:
npm install -g pm2
pm2 start "bun run start" --name memex
pm2 save && pm2 startup
```

### Option 4: Docker

Create a `Dockerfile`:
```dockerfile
FROM oven/bun:1 as deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 as builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1 as runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["bun", "server.js"]
```

Then:
```bash
docker build -t memex .
docker run -p 3000:3000 --env-file .env memex
```

---

## 📁 Project Structure

```
memex/
├── prisma/
│   ├── schema.prisma              # Active schema (SQLite by default)
│   └── schema.postgres.prisma     # PostgreSQL version (for production)
├── public/                        # Static assets
├── src/
│   ├── app/
│   │   ├── api/                   # Next.js API routes
│   │   │   ├── chat/              # Chat endpoints
│   │   │   ├── notes/             # Note CRUD + import (URL, file, audio)
│   │   │   ├── inbox/             # Email inbox management
│   │   │   ├── emails/            # Email sending/scheduling
│   │   │   ├── decisions/         # Decision extraction
│   │   │   ├── ai-status/         # AI provider status check
│   │   │   └── ...
│   │   ├── layout.tsx             # Root layout
│   │   └── page.tsx               # Main page (all UI rendered here)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components (pre-built)
│   │   └── memex/                 # Memex-specific components
│   │       ├── chat.tsx           # Chat section
│   │       ├── notes.tsx          # Notes section
│   │       ├── inbox.tsx          # Smart Inbox section
│   │       ├── email-draft-card.tsx  # Interactive email draft card
│   │       ├── settings.tsx       # Settings + AI Provider status
│   │       └── ...
│   ├── lib/
│   │   ├── ai-client.ts           # ⭐ AI provider abstraction layer
│   │   ├── llm.ts                 # LLM functions (chat, email drafting, etc.)
│   │   ├── db.ts                  # Prisma client
│   │   ├── retrieval.ts           # BM25 retrieval engine
│   │   ├── email.ts               # Email sending logic
│   │   ├── markdown.ts            # Markdown → HTML conversion
│   │   └── notes.ts               # Note chunking + hashing
│   └── hooks/                     # React hooks
├── .env.example                   # Environment variable template
├── package.json                   # Dependencies + scripts
└── README.md                      # This file
```

---

## 🔌 API Reference

### Chat
- `POST /api/chat` — Send a message, get AI response (with optional emailDraft)
- `GET /api/chat/sessions` — List all chat sessions
- `GET /api/chat/sessions/[id]` — Get a session with all messages
- `PATCH /api/chat/sessions/[id]` — Rename a session
- `DELETE /api/chat/sessions/[id]` — Delete a session
- `PATCH /api/chat/sessions/[id]/messages/[messageId]` — Update a message's emailDraft
- `POST /api/chat/email-regenerate` — Regenerate an email draft with feedback
- `POST /api/chat/email-subject` — Generate a subject from an email body

### Notes
- `GET /api/notes` — List notes
- `POST /api/notes` — Create a note
- `GET /api/notes/[id]` — Get a note with chunks + decisions
- `PATCH /api/notes/[id]` — Update a note
- `DELETE /api/notes/[id]` — Delete a note
- `POST /api/notes/import-url` — Import a web page as a note
- `POST /api/notes/upload-file` — Upload PDF/Word/PPT/TXT as a note
- `POST /api/notes/audio` — Transcribe audio + structure as a note
- `POST /api/notes/bulk` — Bulk operations (delete, pin, export)

### Inbox
- `GET /api/inbox` — List inbox emails (with filters)
- `GET /api/inbox/[id]` — Get a single inbox email
- `PATCH /api/inbox/[id]` — Update email (star, archive, mark read)
- `DELETE /api/inbox/[id]` — Delete an email
- `POST /api/inbox/refresh` — Sync emails from IMAP
- `GET /api/inbox/briefing` — Get AI daily briefing

### Emails (Sent)
- `GET /api/emails` — List sent emails
- `POST /api/emails` — Create/send an email
- `PATCH /api/emails` — Verify, resend, cancel, or edit
- `GET /api/emails/templates` — List email templates

### AI
- `GET /api/ai-status` — Get current AI provider status

---

## 🔧 Troubleshooting

### "AI features not working"

1. Go to **Settings** → **AI Provider** section
2. Check if your provider is "Ready" or "Not configured"
3. If not configured, follow the on-screen instructions
4. Make sure your `.env` file has the correct variables
5. Restart the dev server: `bun run dev`

### "Rate limited" errors

- **Gemini**: 1500 requests/day free tier — if you hit this, wait 24h or switch to Ollama (unlimited)
- **Groq**: 30 requests/minute — slow down or switch to Gemini
- **OpenAI**: paid, rate limits are high

### "Database connection failed"

- **SQLite**: Make sure `db/` directory exists and is writable
- **PostgreSQL**: Check your `DATABASE_URL` format: `postgresql://user:pass@host:5432/dbname`
- Run `bun run db:push` to create tables

### "Email sending failed"

- For Gmail: use an **App Password**, not your regular password ([get one here](https://myaccount.google.com/apppasswords))
- Check that SMTP settings are correct in Smart Inbox → Connect Account
- Without SMTP credentials, emails are saved locally (simulated delivery)

### "Audio transcription not supported"

- The audio-to-note feature requires Groq or OpenAI as your AI provider
- Gemini and Ollama don't support speech-to-text
- Switch: set `AI_PROVIDER=groq` in your `.env`

### Port 3000 already in use

```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9
# Or use a different port
PORT=3001 bun run dev
```

---

## 📤 Uploading to GitHub

### Step 1: Create a GitHub Repository

1. Go to [github.com](https://github.com) and sign in
2. Click the **+** icon (top right) → **New repository**
3. Name it `memex` (or whatever you like)
4. Choose **Public** or **Private**
5. **Don't** check "Add a README" or "Add .gitignore" — your project already has them
6. Click **Create repository**

### Step 2: Prepare Your Project

Your `.gitignore` is already configured to exclude:
- `node_modules/` (1.3 GB — must not be uploaded)
- `.next/` (build cache)
- `db/*.db` (your personal database)
- `.env` (your secrets)
- `.z-ai-config` (sandbox credentials)
- `dev.log`, `server.log`

### Step 3: Push to GitHub

Run these commands in your project directory (replace `YOUR_USERNAME`):

```bash
# Initialize git (if not already done)
git init

# Add all files (respecting .gitignore)
git add -A

# Verify what will be committed — make sure no secrets!
git status

# Commit
git commit -m "Initial commit: Memex — citation-first knowledge + email management system"

# Add your GitHub repository as the remote
git remote add origin https://github.com/YOUR_USERNAME/memex.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 4: Verify

1. Go to your repository on GitHub
2. Check that `node_modules/` is NOT there (it should be ignored)
3. Check that `.env` is NOT there (it should be ignored)
4. Check that `package.json` IS there (this is what others need to install dependencies)

### Step 5: When Someone Clones Your Repo

They just need to:
```bash
git clone https://github.com/YOUR_USERNAME/memex.git
cd memex
bun install          # installs all dependencies from package.json
cp .env.example .env # create env file
# edit .env with their API keys
bun run db:push      # create database tables
bun run dev          # start the server
```

---

## 📦 Dependencies

All dependencies are listed in `package.json`. When someone runs `bun install`, they all get installed automatically. Key dependencies:

- `next` — the web framework
- `react` / `react-dom` — UI library
- `prisma` / `@prisma/client` — database ORM
- `openai` — universal LLM client (works with Gemini, Groq, OpenAI, etc.)
- `z-ai-web-dev-sdk` — sandbox AI fallback (only used in sandbox)
- `nodemailer` — email sending
- `imapflow` — email receiving
- `pdf-parse`, `mammoth`, `jszip` — file text extraction
- `react-markdown`, `remark-gfm` — Markdown rendering
- `zustand`, `@tanstack/react-query` — state management
- `tailwindcss`, shadcn/ui components — styling
- `lucide-react` — icons
- `sonner` — toast notifications
- `framer-motion` — animations

To update all dependencies:
```bash
bun update
```

To add a new dependency:
```bash
bun add package-name
```

---

## 📄 License



---

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/), [Prisma](https://www.prisma.io/), and [shadcn/ui](https://ui.shadcn.com/)
- AI powered by your choice of [Google Gemini](https://ai.google.dev/), [Groq](https://groq.com/), [OpenAI](https://openai.com/), or [Ollama](https://ollama.ai/)
- Inspired by the original Memex vision by Vannevar Bush (1945)

---

**Questions?** Check the [Troubleshooting](#-troubleshooting) section or open an issue on GitHub.
