// LLM utilities: citation-enforced answering + decision extraction.
// Uses z-ai-web-dev-sdk chat completions (server-side only).

import ZAI from "z-ai-web-dev-sdk"

let zaiPromise: Promise<ZAI> | null = null
function getClient(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create()
  return zaiPromise
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry wrapper with exponential backoff for 429 (rate limit) errors.
// The z-ai SDK does not retry by default, and bulk operations (decision
// extraction, chat during traffic spikes) can hit 429s. We retry up to 5
// times with 5s, 10s, 20s, 40s, 60s backoff.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 5
const BASE_BACKOFF_MS = 5000

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("429") || msg.toLowerCase().includes("too many requests")
}

async function withRetry<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const value = await fn()
      return { ok: true, value }
    } catch (err) {
      lastErr = err
      if (!isRateLimited(err)) return { ok: false, error: err }
      if (attempt === MAX_RETRIES) break
      // Exponential backoff with jitter: 5s, 10s, 20s, 40s, 60s
      const baseBackoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), 60000)
      const jitter = Math.random() * 2000 // Add randomness to avoid thundering herd
      const backoff = baseBackoff + jitter
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  return { ok: false, error: lastErr }
}

export interface ContextChunk {
  id: string
  sourcePath: string
  headingPath: string
  chunkIndex: number
  text: string
  score: number
}

export interface CitedAnswer {
  answer: string
  citedChunkIds: string[]
  refused: boolean
  serviceError: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart multi-mode chat — intent detection + appropriate response.
// The chat can operate in 4 modes:
//   1. NOTE_QA  — citation-first Q&A from notes (the original differentiator)
//   2. APP_HELP — questions about how to use Memex itself
//   3. GENERAL  — normal conversation, greetings, general knowledge
//   4. EMAIL    — questions about the user's inbox/emails
// ─────────────────────────────────────────────────────────────────────────────

export type ChatMode = "note_qa" | "app_help" | "general" | "email"

export interface SmartAnswer {
  answer: string
  mode: ChatMode
  citedChunkIds: string[]
  refused: boolean
  serviceError: boolean
}

const SMART_SYSTEM_PROMPT = `You are Memex, a friendly, intelligent, and highly capable AI assistant. You are deeply knowledgeable about the app you live in, can hold any conversation, and can help users take actions. You have FIVE capabilities:

## 1. Note Q&A (citation-first)
When the user asks about something that might be in their notes (technical decisions, project rationale, past choices, study material), you answer using ONLY the provided context chunks. Every factual claim MUST be cited with [^chunk_id]. If the context doesn't contain the answer, say "I don't have a source for this in your notes." Never speculate about note content.

## 2. App Help (you know EVERYTHING about Memex)
You are the ultimate guide to Memex. You know every feature, every setting, every shortcut. When users ask about the app, explain clearly and helpfully. Here is your complete knowledge:

**Notes section:**
- Write notes manually with live Markdown preview (Edit/Split toggle)
- Import from URL (paste any web page URL, AI extracts content)
- Upload files: PDF, Word (.docx), PowerPoint (.pptx), TXT, Markdown
- Audio to Note: speak in English or Hindi (Hindi becomes Hinglish), AI transcribes + structures
- Quick start templates: Decision, Meeting, Blank
- Each note is chunked by H2 headings (~512 tokens per chunk) for precise citation
- AI auto-extracts decisions from notes ("We chose X because Y")
- Pin important notes, filter by tags, duplicate, edit with live preview
- Table of contents auto-generated from headings
- Export all notes as Markdown
- Bulk select: select multiple notes → pin, export, or delete

**Chat section:**
- Ask anything — about notes, about the app, or just chat
- AI detects intent: note Q&A (with citations), app help, general conversation, email help
- Citation pills [^chunkId] are clickable — opens source chunk
- Chat export as Markdown, rename sessions, A/B compare two sessions
- In-session search (Find button), keyboard shortcut "/" to focus input
- Sessions sidebar is resizable (drag the border)
- If AI is rate-limited, falls back to BM25 search results

**Decisions section:**
- AI-extracted from notes automatically
- Each decision has: title, rationale, alternatives, confidence score, source chunk
- Filter by confidence slider, search, pin important decisions
- Copy as quote (markdown blockquote), view related decisions by topic overlap
- Click any decision to see the source chunk it came from

**Timeline section:**
- Notes and decisions interleaved chronologically
- Filter by date range, by project
- Click events to open source

**Analytics section:**
- Most-cited chunks (which notes the AI references most)
- Question activity chart (14 days)
- Project distribution
- Export as CSV or JSON

**Smart Inbox section:**
- Connect your email account (Gmail, Outlook, Yahoo, iCloud)
- For Gmail: use an App Password (go to myaccount.google.com/apppasswords), NOT your regular password
- IMAP = Internet Message Access Protocol — it's how apps read your email. You don't need to know what it is; just provide your email + app password and Memex handles the rest
- Without a password, inbox runs in Demo Mode (sample emails)
- With a password, inbox syncs REAL emails from your inbox + sent folder
- AI categorizes each email: urgent (needs immediate action), important (needs response), normal, newsletter, spam
- AI writes a short summary + key points for each email
- AI suggests reply drafts for emails that need responses
- AI Reply Generator: type an instruction ("accept and suggest Tuesday") → AI drafts the reply
- Daily Email Briefing: one-click AI summary of today's important emails
- Convert any email to a note with one click
- Search inbox by sender/subject/body
- Thread view: group emails by conversation
- Star, archive, mark read/unread
- Browser notifications for urgent emails
- Manage connected accounts (view, disconnect)

**Sent section (formerly Outbox):**
- All emails sent from Memex (composed, chat answers, decision briefs, digests)
- Schedule emails for future delivery (background scheduler delivers them)
- Status pipeline: queued → scheduled → delivered
- Email templates: Daily Digest, Decision Brief, Source Snapshot
- When connected with SMTP credentials, emails are sent via REAL SMTP (nodemailer)
- Without SMTP, emails are saved locally (simulated delivery)

**Settings section:**
- Profile: name, email, SMTP settings
- Daily digest: enable/disable, set hour
- Security & Privacy: local storage (all data on your device), LLM privacy mode (only relevant snippets sent to AI), data encryption indicator, erase all data (Danger Zone — type "ERASE ALL DATA" to confirm)
- Dark mode toggle
- Shield icon in sidebar shows data is encrypted locally

**Keyboard shortcuts:**
- Cmd+K / Ctrl+K: Command palette (search notes, decisions, navigate, actions)
- ?: Show shortcuts help
- /: Focus chat input (when on Chat section)
- Esc: Close dialog/panel
- Enter: Send chat message
- Shift+Enter: New line in chat

**Command palette (Cmd+K):**
- Navigate to any section
- Start new chat, compose email, run digest
- Switch light/dark theme
- Search notes and decisions

**Security:**
- All data stored locally in SQLite database
- No cloud sync — your data never leaves your device
- Only relevant note chunks (not entire library) sent to AI for analysis
- Email credentials stored locally
- Full data erase available in Settings

## 3. General Conversation
When the user says "hi", "hello", "thanks", asks general questions not related to their notes or the app, or just wants to chat — respond warmly and naturally. You CAN use your general knowledge. Be conversational, not robotic. If they greet you, greet back and briefly mention what you can help with. Handle any topic — technology, science, history, casual chat, jokes, etc.

## 4. Email Help
When the user asks about emails, their inbox, or email management:
- If email context is provided, use it to answer
- If they ask "what is IMAP" or "how do I connect my email" → explain in simple terms
- If they want to send an email → tell them to use the Compose Email button or go to Sent section
- If they want to check emails → tell them to go to Smart Inbox and click Sync
- Explain AI categorization, summaries, reply drafts, daily briefing

## 5. Action Assistance & Email Drafting
When the user wants to DO something, be proactive and helpful:

**Email sending (MOST IMPORTANT):**
When the user says "send an email to X about Y" or "email John about Z":
1. IMMEDIATELY draft the email content in your response — write the actual subject and body
2. Format it clearly:
   **To:** john@example.com
   **Subject:** Project Update — [specific subject]
   
   [Full email body written for them]
3. Tell them: "I've drafted this email for you. Click the **Email** button below this message to open it in the composer, review it, and send it."
4. Do NOT just say "go to compose and fill it in" — that's unhelpful. DRAFT THE ACTUAL EMAIL.

**Other actions:**
- "Check my emails" → "Go to Smart Inbox in the left sidebar under Email, then click Sync. Your emails will be categorized by AI."
- "Add a note about X" → "Click the Add button in Notes, then choose Write manually, Upload file, or Audio to note."

## Rules
- For note questions: ALWAYS cite with [^chunk_id]. If no relevant context, say "I don't have a source for this in your notes."
- For general conversation, app help, and email help: be warm, concise, and helpful. No citations needed.
- Use Markdown formatting for readability.
- Keep answers focused — don't ramble.
- If the user's intent is ambiguous, lean toward being helpful and conversational.
- NEVER say "I can't do that" — instead explain HOW they can do it themselves or DO it for them.
- When explaining technical terms (IMAP, SMTP, BM25, etc.), use simple language.
- **CONVERSATION CONTINUITY (CRITICAL):** Always read the conversation history before responding. If the user says "what about Redis?" after discussing databases, understand they're asking about Redis in the context of the previous database discussion. Never ignore previous messages. If the user asks a follow-up question, answer it in the context of what was discussed before — don't start a new topic.
- **EMAIL DRAFTING:** When the user asks to send an email, ALWAYS draft the full email (subject + body) in your response. Do NOT just tell them to go click a button. Write the actual email content for them.`

export async function generateSmartAnswer(
  question: string,
  chunks: ContextChunk[],
  history: { role: "user" | "assistant"; content: string }[] = [],
  emailContext?: string
): Promise<SmartAnswer> {
  // Build a compact context block — only include the most relevant chunks
  // and keep email context SHORT to avoid drowning out conversation history
  const contextBlock = chunks.length > 0 ? buildContextBlock(chunks.slice(0, 3)) : ""
  const shortEmailContext = emailContext ? emailContext.slice(0, 800) : ""

  // Keep MORE conversation history (last 10 messages = 5 exchanges)
  // This is critical for maintaining conversation flow
  const recentHistory = history.slice(-10)

  // Build the user prompt — keep it SHORT so conversation history fits
  // The context is provided as SEPARATE messages, not stuffed into the user prompt
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SMART_SYSTEM_PROMPT },
  ]

  // Add note context as a system-level note (not part of the conversation)
  if (contextBlock) {
    messages.push({
      role: "system",
      content: `NOTE CONTEXT (use ONLY if the user asks about their notes, cite with [^chunk_id]):\n${contextBlock}`,
    })
  }

  // Add email context as a system-level note (keep it SHORT)
  if (shortEmailContext) {
    messages.push({
      role: "system",
      content: `RECENT INBOX EMAILS (use ONLY if the user asks about emails):\n${shortEmailContext}`,
    })
  }

  // Add conversation history — this is the KEY part for maintaining flow
  messages.push(...recentHistory.map((h) => ({ role: h.role, content: h.content })))

  // Add the current user message as a clean, simple message
  // (NOT wrapped in context — the context is already in system messages above)
  messages.push({ role: "user", content: question })

  const zai = await getClient()
  let raw = ""
  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages,
      temperature: 0.4,
      max_tokens: 800,
    })
  )
  if (!result.ok) {
    return {
      answer:
        "⚠️ I'm having trouble connecting right now (rate limited). Please try again in a moment — your message has been saved.",
      mode: "general",
      citedChunkIds: [],
      refused: false,
      serviceError: true,
    }
  }
  const completion = result.value
  if (typeof completion === "string") {
    raw = completion
  } else if (completion?.choices?.[0]?.message?.content) {
    raw = completion.choices[0].message.content
  } else if (completion?.content) {
    raw = completion.content
  } else {
    raw = String(completion ?? "")
  }

  // Post-process: extract + verify citations
  const validIds = new Set(chunks.map((c) => c.id))
  const cited = new Set<string>()
  const markerRe = /\[\^([a-z0-9]+)\]/gi
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(raw)) !== null) {
    const id = m[1]
    if (validIds.has(id)) cited.add(id)
  }

  // Detect mode from the answer
  const lower = raw.toLowerCase()
  let mode: ChatMode = "general"
  if (cited.size > 0) mode = "note_qa"
  else if (lower.includes("i don't have a source") || lower.includes("in your notes")) mode = "note_qa"
  else if (lower.includes("memex can") || lower.includes("you can") || lower.includes("to add a note") || lower.includes("keyboard shortcut") || lower.includes("command palette")) mode = "app_help"
  else if (lower.includes("email") || lower.includes("inbox")) mode = "email"

  const refused = mode === "note_qa" && cited.size === 0

  return {
    answer: raw.trim(),
    mode,
    citedChunkIds: Array.from(cited),
    refused,
    serviceError: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Original citation-first prompt (the critical differentiator)
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Memex, a citation-first knowledge assistant. You answer questions using ONLY the provided context chunks. You must cite the source of every claim using inline markers [^chunk_id].

RULES:
1. Every factual statement MUST be followed by [^<chunk_id>].
2. If the context does not contain information to answer, say exactly: "I don't have a source for this."
3. Never use outside knowledge. Never speculate.
4. If multiple chunks support a claim, cite all of them: [^a] [^b].
5. Keep answers under 200 words. Be concrete, not verbose.
6. Use Markdown formatting for readability (headings, lists, bold).`

function buildContextBlock(chunks: ContextChunk[]): string {
  return chunks
    .map((c) => {
      return `[chunk_id: ${c.id}]
source: ${c.sourcePath}${c.headingPath ? ` (section: ${c.headingPath})` : ""}
---
${c.text}`
    })
    .join("\n\n")
}

export async function generateCitedAnswer(
  question: string,
  chunks: ContextChunk[],
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<CitedAnswer> {
  if (chunks.length === 0) {
    return {
      answer: "I don't have a source for this.",
      citedChunkIds: [],
      refused: true,
      serviceError: false,
    }
  }

  const contextBlock = buildContextBlock(chunks)
  const userPrompt = `CONTEXT CHUNKS:
${contextBlock}

QUESTION: ${question}

ANSWER (with [^chunk_id] citations):`

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userPrompt },
  ]

  const zai = await getClient()
  let raw = ""
  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages,
      temperature: 0.3,
      max_tokens: 600,
    })
  )
  if (!result.ok) {
    // Distinguish a genuine service error from an honest refusal.
    return {
      answer:
        "⚠️ The reasoning service is temporarily unavailable (rate limited). Please try again in a moment — your question has been saved.",
      citedChunkIds: [],
      refused: false,
      serviceError: true,
    }
  }
  const completion = result.value
  if (typeof completion === "string") {
    raw = completion
  } else if (completion?.choices?.[0]?.message?.content) {
    raw = completion.choices[0].message.content
  } else if (completion?.content) {
    raw = completion.content
  } else {
    raw = String(completion ?? "")
  }

  // Post-process: verify every [^chunk_id] marker exists in the provided context.
  const validIds = new Set(chunks.map((c) => c.id))
  const cited = new Set<string>()
  const markerRe = /\[\^([a-z0-9]+)\]/gi
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(raw)) !== null) {
    const id = m[1]
    if (validIds.has(id)) cited.add(id)
  }

  // Detect refusal
  const refused =
    raw.trim().toLowerCase().startsWith("i don't have a source for this") ||
    cited.size === 0

  return {
    answer: raw.trim(),
    citedChunkIds: Array.from(cited),
    refused,
    serviceError: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email intelligence — categorization, summarization, draft replies.
// ─────────────────────────────────────────────────────────────────────────────

export type EmailCategory = "urgent" | "important" | "normal" | "newsletter" | "spam"
export type EmailAction = "reply_needed" | "review" | "archive" | "unsubscribe"

export interface EmailAnalysis {
  category: EmailCategory
  action: EmailAction
  summary: string
  keyPoints: string[]
  suggestedReply?: string
}

const EMAIL_ANALYSIS_PROMPT = `You are Memex's email intelligence assistant. Analyze the given email and return a JSON object with:

{
  "category": "urgent" | "important" | "normal" | "newsletter" | "spam",
  "action": "reply_needed" | "review" | "archive" | "unsubscribe",
  "summary": "A SHORT, CLEAR summary in this format: '[Sender] wants you to [do X] by [deadline]. [Key detail].' Keep it under 15 words. Be specific about what action is needed — don't just restate the subject line. If no action is needed, say what the email is informing you about.",
  "keyPoints": ["3-5 bullet points, each starting with an action verb or clear topic. Be specific — include dates, amounts, or names."],
  "suggestedReply": "A draft reply if action is reply_needed, otherwise null"
}

SUMMARY RULES (very important):
- DON'T just restate the subject — extract the ACTION or KEY INFORMATION
- DO say what the sender wants from you (reply, approve, review, pay, etc.)
- DO include deadlines or dates if mentioned
- DO include amounts if it's a bill or payment
- Keep it under 15 words — shorter is better
- Bad summary: "A pull request has been opened to add a scheduling feature"
- Good summary: "GitHub wants you to review PR #142 by checking 2 changed files"

Category guidelines:
- urgent: time-sensitive, requires immediate action (deadlines today/tomorrow, outages, legal)
- important: needs a response or review but not time-critical (project updates, requests this week)
- normal: routine communication (confirmations, updates, standup summaries)
- newsletter: marketing, digests, automated content
- spam: unwanted, phishing, irrelevant

Respond with JSON only, no prose.`

export async function analyzeEmail(
  from: string,
  subject: string,
  body: string
): Promise<EmailAnalysis | null> {
  const zai = await getClient()
  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages: [
        { role: "system", content: EMAIL_ANALYSIS_PROMPT },
        {
          role: "user",
          content: `FROM: ${from}\nSUBJECT: ${subject}\n\nBODY:\n${body.slice(0, 2000)}\n\nJSON:`,
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
    })
  )
  if (!result.ok) return null
  try {
    const completion = result.value
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as EmailAnalysis
  } catch {
    return null
  }
}

// Generate a reply draft for an email
export async function draftEmailReply(
  from: string,
  subject: string,
  body: string,
  instruction: string
): Promise<string> {
  const zai = await getClient()
  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a helpful email assistant. Draft a professional, concise reply based on the user's instruction. Write only the reply body, no subject line.",
        },
        {
          role: "user",
          content: `ORIGINAL EMAIL FROM: ${from}\nSUBJECT: ${subject}\nBODY: ${body.slice(0, 1500)}\n\nUSER'S INSTRUCTION: ${instruction}\n\nDRAFT REPLY:`,
        },
      ],
      temperature: 0.5,
      max_tokens: 400,
    })
  )
  if (!result.ok) return "Unable to generate a draft at this time."
  const completion = result.value
  let raw = ""
  if (typeof completion === "string") raw = completion
  else if (completion?.choices?.[0]?.message?.content)
    raw = completion.choices[0].message.content
  else raw = String(completion ?? "")
  return raw.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM reranker — semantic re-ranking of BM25 candidates.
// We ask the model to score 0..1 relevance of each candidate to the query.
// Falls back gracefully if the model misbehaves.
// ─────────────────────────────────────────────────────────────────────────────

export async function llmRerank(
  query: string,
  chunks: ContextChunk[]
): Promise<ContextChunk[]> {
  if (chunks.length <= 1) return chunks
  const zai = await getClient()
  const numbered = chunks
    .map((c, i) => `[${i}] ${c.text.slice(0, 400)}`)
    .join("\n")
  const prompt = `Rate the relevance of each candidate passage to the query on a scale of 0.0 to 1.0. Respond ONLY with a JSON array of numbers, one per candidate, in order. No prose.

QUERY: ${query}

CANDIDATES:
${numbered}

JSON scores:`
  try {
    const result = await withRetry(() =>
      zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a relevance rater. Output only a JSON array of floats between 0 and 1.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 200,
      })
    )
    if (!result.ok) return chunks
    const completion = result.value
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return chunks
    const scores = JSON.parse(match[0]) as number[]
    if (!Array.isArray(scores) || scores.length !== chunks.length) return chunks
    return chunks
      .map((c, i) => ({ ...c, score: c.score * 0.4 + (scores[i] ?? 0) * 2 }))
      .sort((a, b) => b.score - a.score)
  } catch {
    return chunks
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision extraction (Phase 8 of the spec)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedDecision {
  title: string
  decisionDate: string
  alternatives: string[]
  rationale: string
  outcome: string
  participants: string[]
  confidence: number
}

const DECISION_PROMPT = `You are Memex's decision extractor. Read the following note chunk and extract any decisions it contains. A decision is a statement that X was chosen over Y for reason Z.

If no decision is present, return {"decisions": []}.

If decisions are present, return JSON:
{
  "decisions": [
    {
      "title": "Use Postgres for primary DB",
      "decision_date": "2024-03-14",
      "alternatives": ["Mongo", "SQLite"],
      "rationale": "ACID guarantees matter for financial data",
      "outcome": "Working well 6 months later",
      "participants": ["@me"],
      "confidence": 0.9
    }
  ]
}

Respond with JSON only, no prose. Dates must be ISO format YYYY-MM-DD or null.`

export async function extractDecisions(
  chunkText: string,
  headingPath: string
): Promise<ExtractedDecision[]> {
  const zai = await getClient()
  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages: [
        { role: "system", content: DECISION_PROMPT },
        {
          role: "user",
          content: `Heading path: ${headingPath}\n\nNOTE CHUNK:\n${chunkText}\n\nJSON:`,
        },
      ],
      temperature: 0.1,
      max_tokens: 600,
    })
  )
  if (!result.ok) return []
  try {
    const completion = result.value
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return []
    const parsed = JSON.parse(match[0]) as { decisions?: ExtractedDecision[] }
    if (!parsed.decisions || !Array.isArray(parsed.decisions)) return []
    return parsed.decisions.filter((d) => d && d.title && d.rationale)
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured email drafting — produces a ready-to-send email draft as JSON.
// This is the CRITICAL function for the chat-driven email flow:
//   - The body is EXACTLY what gets sent (no preamble, no chat history,
//     no internal prompts, no assistant reasoning).
//   - The subject is concise, professional, and derived from the body content.
//   - The recipient is parsed from the user's instruction.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailDraftResult {
  recipient: string
  subject: string
  bodyMarkdown: string
  rationale: string
}

const EMAIL_DRAFT_PROMPT = `You are Memex's email drafting assistant. The user wants to send an email. Draft a complete, ready-to-send email based on their instruction.

CRITICAL RULES (read carefully):
1. The "bodyMarkdown" field must contain ONLY the email body — the actual message the recipient will read.
   - NO preamble like "Here's your email:" or "I've drafted this for you"
   - NO meta-commentary about the email
   - NO instructions to the user
   - NO copy of the user's original instruction
   - NO conversation history
   - NO assistant reasoning or thought process
2. The "subject" must be:
   - Concise (under 60 characters)
   - Professional
   - Directly relevant to the email body
   - NOT generic like "Email" or "Message"
3. The "recipient" must be:
   - A valid email address (e.g., "john@example.com")
   - If the user said "to me", "send to myself", or no recipient: use "me"
   - Extract the exact email address from the instruction if present
4. The body should:
   - Start with a professional greeting ("Hi [Name]," or "Dear [Name],")
   - Be concise and clear
   - Use Markdown formatting (headings, lists, bold) where helpful
   - End with a professional sign-off ("Best regards," / "Thanks," etc.)
   - Be ready to send AS-IS — what you write here is exactly what gets sent
5. The "rationale" is a brief (1 sentence) note to the USER (not the recipient) explaining what you drafted.
6. NEVER include the user's original instruction in the body.
7. NEVER include chat history or prior conversation in the body.
8. NEVER include internal reasoning or thought process in the body.

Return ONLY a JSON object with this exact shape:
{
  "recipient": "email@address.com",
  "subject": "Concise subject line",
  "bodyMarkdown": "Hi Name,\\n\\n[Email body here]\\n\\nBest regards,\\nMemex User",
  "rationale": "Brief note to the user about what was drafted"
}`

export async function draftEmailFromInstruction(
  instruction: string,
  emailContext?: string
): Promise<EmailDraftResult | null> {
  const zai = await getClient()
  const userContent = `INSTRUCTION:
${instruction}
${emailContext ? `\nRECENT INBOX CONTEXT (use only if relevant to the email):\n${emailContext.slice(0, 600)}\n` : ""}
JSON:`

  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages: [
        { role: "system", content: EMAIL_DRAFT_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.5,
      max_tokens: 900,
    })
  )
  if (!result.ok) return null
  try {
    const completion = result.value
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as EmailDraftResult
    if (!parsed.recipient || !parsed.subject || !parsed.bodyMarkdown) return null
    // Sanitize: strip any leaked preamble patterns from the body
    let body = parsed.bodyMarkdown.trim()
    body = body.replace(/^(here'?s?\s+(?:your|the)\s+email[^:]*:\s*)/i, "")
    body = body.replace(/^(i'?ve\s+drafted[^:]*:\s*)/i, "")
    body = body.replace(/^(draft\s+email[^:]*:\s*)/i, "")
    return {
      recipient: parsed.recipient.trim(),
      subject: parsed.subject.trim().replace(/^["']|["']$/g, ""),
      bodyMarkdown: body,
      rationale: (parsed.rationale || "Drafted based on your instruction.").trim(),
    }
  } catch {
    return null
  }
}

// Regenerate an email draft based on user feedback (e.g., "make it shorter",
// "more formal", "add a meeting time").
export async function regenerateEmailDraft(
  originalInstruction: string,
  previousDraft: EmailDraftResult,
  feedback: string
): Promise<EmailDraftResult | null> {
  const zai = await getClient()
  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages: [
        { role: "system", content: EMAIL_DRAFT_PROMPT },
        {
          role: "user",
          content: `INSTRUCTION:
${originalInstruction}

PREVIOUS DRAFT (improve this based on feedback):
Recipient: ${previousDraft.recipient}
Subject: ${previousDraft.subject}
Body:
${previousDraft.bodyMarkdown}

USER FEEDBACK:
${feedback}

JSON:`,
        },
      ],
      temperature: 0.6,
      max_tokens: 900,
    })
  )
  if (!result.ok) return null
  try {
    const completion = result.value
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as EmailDraftResult
    if (!parsed.recipient || !parsed.subject || !parsed.bodyMarkdown) return null
    let body = parsed.bodyMarkdown.trim()
    body = body.replace(/^(here'?s?\s+(?:your|the)\s+email[^:]*:\s*)/i, "")
    body = body.replace(/^(i'?ve\s+drafted[^:]*:\s*)/i, "")
    return {
      recipient: parsed.recipient.trim(),
      subject: parsed.subject.trim().replace(/^["']|["']$/g, ""),
      bodyMarkdown: body,
      rationale: (parsed.rationale || "Regenerated based on your feedback.").trim(),
    }
  } catch {
    return null
  }
}

// Generate a concise, professional subject from an email body.
// Used when the user edits the body — the subject can be auto-updated.
export async function generateEmailSubject(bodyMarkdown: string): Promise<string | null> {
  if (!bodyMarkdown.trim()) return null
  const zai = await getClient()
  const result = await withRetry(() =>
    zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You generate a concise, professional email subject line based on the email body. Rules:
- Under 60 characters
- Directly relevant to the body content
- Professional tone
- No quotes, no trailing punctuation
- No prefix like "Subject:" — just the subject text itself
Respond with ONLY the subject text, nothing else.`,
        },
        {
          role: "user",
          content: `EMAIL BODY:
${bodyMarkdown.slice(0, 1500)}

SUBJECT:`,
        },
      ],
      temperature: 0.3,
      max_tokens: 60,
    })
  )
  if (!result.ok) return null
  try {
    const completion = result.value
    let raw = ""
    if (typeof completion === "string") raw = completion
    else if (completion?.choices?.[0]?.message?.content)
      raw = completion.choices[0].message.content
    else raw = String(completion ?? "")
    const subject = raw.trim().replace(/^["']|["']$/g, "").replace(/^subject:\s*/i, "")
    if (!subject || subject.length > 120) return null
    return subject
  } catch {
    return null
  }
}
