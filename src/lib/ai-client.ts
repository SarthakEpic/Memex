// ─────────────────────────────────────────────────────────────────────────────
// AI Provider Abstraction Layer
// ─────────────────────────────────────────────────────────────────────────────
//
// This module provides one interface for supported hosted and local providers.
// Provider pricing, model availability, privacy terms, and quotas change over time;
// verify them in the provider console and configure Memex's local budget below.
// No request silently falls back to a different provider.
//
// ENVIRONMENT VARIABLES (see .env.example):
//
//   AI_PROVIDER     = "gemini" | "groq" | "openrouter" | "openai" | "ollama" | "custom"
//                     (default: "gemini")
//
//   AI_MODEL        = override the default model for the chosen provider
//                     (optional — each provider has a sensible default)
//
//   AI_TEMPERATURE  = default sampling temperature (default: 0.4)
//
//   AI_MAX_TOKENS   = default max output tokens (default: 800)
//
//   Provider-specific API keys (set the one for your chosen provider):
//     GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY
//
//   For custom providers:
//     AI_BASE_URL    = the OpenAI-compatible base URL
//     AI_API_KEY     = the API key
//
//   For Ollama (local, no key needed):
//     OLLAMA_HOST    = http://localhost:11434 (default)
//
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto"
import OpenAI from "openai"
import {
  estimateTokens,
  reconcileAIBudget,
  reserveAIBudget,
  setAIProviderCooldown,
  type AIRequestIdentity,
} from "@/server/ai/budget"

// ─────────────────────────────────────────────────────────────────────────────
// Provider configuration
// ─────────────────────────────────────────────────────────────────────────────
//
// FALLBACK BEHAVIOR:
// If no AI_PROVIDER env var is set AND the z-ai-web-dev-sdk config file
// exists (sandbox environment), we fall back to the z-ai-web-dev-sdk.
// This keeps the project working in the sandbox while being fully portable
// when deployed elsewhere (just set AI_PROVIDER + the provider's API key).
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync } from "fs"

// Check if we're in the sandbox (z-ai config file exists)
const ZAI_CONFIG_PATHS = [
  "/etc/.z-ai-config",
  `${process.env.HOME || ""}/.z-ai-config`,
  "./.z-ai-config",
]
const zaiConfigExists = ZAI_CONFIG_PATHS.some((p) => {
  try {
    return existsSync(p)
  } catch {
    return false
  }
})

// Dynamic import of z-ai-web-dev-sdk (only loaded if needed for sandbox fallback)
let zaiClientPromise: Promise<any> | null = null
async function getZaiClient(): Promise<any> {
  if (!zaiClientPromise) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default
    zaiClientPromise = ZAI.create()
  }
  return zaiClientPromise
}

interface ProviderConfig {
  name: string
  baseURL: string
  apiKey: string
  defaultModel: string
  // Some providers (Ollama) don't need an API key — use a dummy value
  apiKeyRequired: boolean
}

const PROVIDERS: Record<string, ProviderConfig> = {
  // Google Gemini via its OpenAI-compatible endpoint.
  gemini: {
    name: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY || "",
    defaultModel: "gemini-3.6-flash",
    apiKeyRequired: true,
  },

  // Groq via its OpenAI-compatible endpoint.
  groq: {
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY || "",
    defaultModel: "openai/gpt-oss-120b",
    apiKeyRequired: true,
  },

  // OpenRouter aggregator. Verify each selected model's current terms.
  openrouter: {
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "",
    defaultModel: "google/gemma-4-31b-it:free",
    apiKeyRequired: true,
  },

  // OpenAI.
  openai: {
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    defaultModel: "gpt-4o-mini",
    apiKeyRequired: true,
  },

  // Ollama local runtime; capacity depends on the host machine.
  ollama: {
    name: "Ollama (local)",
    baseURL: process.env.OLLAMA_HOST
      ? `${process.env.OLLAMA_HOST.replace(/\/$/, "")}/v1`
      : "http://localhost:11434/v1",
    apiKey: "ollama", // Ollama doesn't check the key, but the SDK requires one
    defaultModel: "llama3.1:8b",
    apiKeyRequired: false,
  },

  // Custom — any OpenAI-compatible provider
  custom: {
    name: "Custom Provider",
    baseURL: process.env.AI_BASE_URL || "",
    apiKey: process.env.AI_API_KEY || "",
    defaultModel: process.env.AI_MODEL || "gpt-4o-mini",
    apiKeyRequired: true,
  },

  // Sandbox fallback — uses z-ai-web-dev-sdk (only works in the sandbox)
  sandbox: {
    name: "Sandbox AI (z-ai-web-dev-sdk)",
    baseURL: "",
    apiKey: "",
    defaultModel: "z-ai-default",
    apiKeyRequired: false,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Get the active provider configuration
// ─────────────────────────────────────────────────────────────────────────────

function getProviderConfig(): ProviderConfig {
  // If no AI_PROVIDER is set, check if we're in the sandbox
  if (!process.env.AI_PROVIDER) {
    if (zaiConfigExists) {
      // Sandbox fallback — use z-ai-web-dev-sdk
      return PROVIDERS.sandbox
    }
    // No provider configured and no sandbox — default to gemini
    // (will error with a helpful message about setting GEMINI_API_KEY)
    return PROVIDERS.gemini
  }

  const providerKey = process.env.AI_PROVIDER.toLowerCase()
  const config = PROVIDERS[providerKey]

  if (!config) {
    throw new Error(
      `Unknown AI_PROVIDER "${providerKey}". Supported: ${Object.keys(PROVIDERS).join(", ")}`
    )
  }

  if (config.apiKeyRequired && !config.apiKey) {
    const envVar = {
      gemini: "GEMINI_API_KEY",
      groq: "GROQ_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      openai: "OPENAI_API_KEY",
      custom: "AI_API_KEY",
    }[providerKey]

    throw new Error(
      `AI provider "${config.name}" requires the ${envVar} environment variable. ` +
      `Set it in your .env file. See .env.example for details.`
    )
  }

  return config
}

// ─────────────────────────────────────────────────────────────────────────────
// Get the active provider key (resolves sandbox fallback)
// ─────────────────────────────────────────────────────────────────────────────

function getActiveProviderKey(): string {
  if (process.env.AI_PROVIDER) {
    return process.env.AI_PROVIDER.toLowerCase()
  }
  // No explicit provider — check sandbox fallback
  if (zaiConfigExists) {
    return "sandbox"
  }
  // Default to gemini (will require GEMINI_API_KEY)
  return "gemini"
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton OpenAI client
// ─────────────────────────────────────────────────────────────────────────────

let clientInstance: OpenAI | null = null
let clientProvider: string | null = null

export function getAIClient(): OpenAI {
  const providerKey = getActiveProviderKey()

  // Sandbox provider doesn't use the OpenAI SDK — it uses z-ai-web-dev-sdk directly
  // The chatComplete() function handles this case separately.
  // This function is only called for OpenAI-compatible providers.
  if (providerKey === "sandbox") {
    throw new Error(
      "Sandbox AI provider does not use the OpenAI SDK. Use chatComplete() instead."
    )
  }

  // Re-create the client if the provider changed (useful for testing)
  if (clientInstance && clientProvider === providerKey) {
    return clientInstance
  }

  const config = getProviderConfig()

  clientInstance = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey || "dummy-key-for-ollama",
    // Groq and Gemini can be fast — use a generous timeout
    timeout: 60_000,
    // Memex owns retry and quota policy. SDK retries would multiply work invisibly.
    maxRetries: 0,
  })
  clientProvider = providerKey

  return clientInstance
}

// ─────────────────────────────────────────────────────────────────────────────
// Get the model name for the active provider
// ─────────────────────────────────────────────────────────────────────────────

export function getModel(): string {
  const providerKey = getActiveProviderKey()
  const config = PROVIDERS[providerKey]
  // Allow per-request model override via env var
  return process.env.AI_MODEL || config.defaultModel
}

// ─────────────────────────────────────────────────────────────────────────────
// Get default generation parameters
// ─────────────────────────────────────────────────────────────────────────────

export function getDefaultTemperature(): number {
  const t = parseFloat(process.env.AI_TEMPERATURE || "")
  return isNaN(t) ? 0.4 : t
}

export function getDefaultMaxTokens(): number {
  const t = parseInt(process.env.AI_MAX_TOKENS || "", 10)
  return isNaN(t) ? 800 : t
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified chat completion call
// ─────────────────────────────────────────────────────────────────────────────
//
// This wraps the OpenAI SDK's chat.completions.create() with:
//   - Automatic provider detection
//   - Sensible defaults
//   - Consistent error handling
//   - Central quota admission, in-flight deduplication, and structured failures
//
// Usage:
//   const result = await chatComplete({
//     messages: [{ role: "system", content: "..." }, { role: "user", content: "..." }],
//     temperature: 0.4,
//     maxTokens: 800,
//   })
//   // result is the assistant's text response

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatCompleteOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  // Override the model for this specific call
  model?: string
  // Kept for API compatibility; Memex now makes one provider attempt per call.
  noRetry?: boolean
  request?: Partial<AIRequestIdentity> & Pick<AIRequestIdentity, "feature">
  reasoningEffort?: "low" | "medium" | "high"
}

export type AIErrorCode = "budget_exhausted" | "rate_limited" | "timeout" | "configuration" | "invalid_request" | "provider_unavailable"

export interface ChatCompleteResult {
  ok: boolean
  content: string
  error?: string
  // True if the error was a rate limit (caller may want to show a specific message)
  rateLimited?: boolean
  retryAfterMs?: number
  retryAt?: string
  errorCode?: AIErrorCode
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cachedTokens: number
    reasoningTokens: number
  }
  finishReason?: string | null
}

const MAX_RETRIES = 0
const inFlightCompletions = new Map<string, Promise<ChatCompleteResult>>()

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes("429") ||
    msg.toLowerCase().includes("too many requests") ||
    msg.toLowerCase().includes("rate limit")
  )
}

export async function chatComplete(options: ChatCompleteOptions): Promise<ChatCompleteResult> {
  const dedupeKey = completionDedupeKey(options)
  const current = inFlightCompletions.get(dedupeKey)
  if (current) return current
  const pending = executeChatComplete(options).finally(() => inFlightCompletions.delete(dedupeKey))
  inFlightCompletions.set(dedupeKey, pending)
  return pending
}

async function executeChatComplete(options: ChatCompleteOptions): Promise<ChatCompleteResult> {
  const providerKey = getActiveProviderKey()
  const model = options.model || getModel()
  const maxTokens = options.maxTokens ?? getDefaultMaxTokens()
  const identity: AIRequestIdentity = {
    feature: options.request?.feature || "unspecified",
    workClass: options.request?.workClass || "interactive",
    userId: options.request?.userId,
  }
  const estimatedTokens = estimateTokens(options.messages, maxTokens)
  const permit = await reserveAIBudget({ provider: providerKey, model, identity, estimatedTokens })
  if (!permit.admitted) {
    return {
      ok: false,
      content: "",
      error: "The configured AI allowance is currently reserved or exhausted.",
      rateLimited: true,
      errorCode: "budget_exhausted",
      retryAt: permit.retryAt?.toISOString(),
      retryAfterMs: permit.retryAt ? Math.max(0, permit.retryAt.getTime() - Date.now()) : undefined,
    }
  }
  const startedAt = Date.now()

  // ── Sandbox fallback path ──────────────────────────────────────────────────
  // Uses z-ai-web-dev-sdk directly (only works in the sandbox environment)
  if (providerKey === "sandbox") {
    const result = await chatCompleteSandbox(options)
    await reconcileAIBudget({ provider: providerKey, model, identity, permit, durationMs: Date.now() - startedAt, success: result.ok, errorCode: result.errorCode })
    return result
  }

  // ── OpenAI-compatible path ──────────────────────────────────────────────────
  const client = getAIClient()
  const temperature = options.temperature ?? getDefaultTemperature()

  let lastErr: unknown

  for (let attempt = 0; attempt <= (options.noRetry ? 0 : MAX_RETRIES); attempt++) {
    try {
      const request = {
        model,
        messages: options.messages,
        temperature,
        max_tokens: maxTokens,
        ...(options.reasoningEffort && supportsReasoningEffort(providerKey, model)
          ? { reasoning_effort: options.reasoningEffort }
          : {}),
      }
      const completion = await client.chat.completions.create(
        request as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        { maxRetries: 0, timeout: options.noRetry ? 15_000 : 30_000 }
      )

      // Extract the text content — handle different response shapes
      let content = ""
      if (typeof completion === "string") {
        content = completion
      } else if (completion?.choices?.[0]?.message?.content) {
        content = completion.choices[0].message.content
      } else if ((completion as any)?.content) {
        content = (completion as any).content
      } else {
        content = String(completion ?? "")
      }

      const usage = extractUsage(completion)
      const quotaTokens = usage ? Math.max(usage.completionTokens, usage.totalTokens - usage.cachedTokens) : undefined
      await reconcileAIBudget({ provider: providerKey, model, identity, permit, actualTokens: quotaTokens, promptTokens: usage?.promptTokens, completionTokens: usage?.completionTokens, cachedTokens: usage?.cachedTokens, reasoningTokens: usage?.reasoningTokens, durationMs: Date.now() - startedAt, success: true })
      return { ok: true, content: content.trim(), usage, finishReason: completion.choices?.[0]?.finish_reason }
    } catch (err: any) {
      lastErr = err
      const retryAfterMs = getRetryAfterMs(err)

      // If no-retry mode or not a rate limit, return immediately
      if (options.noRetry || !isRateLimited(err)) {
        const errorCode = classifyAIError(err)
        await reconcileAIBudget({ provider: providerKey, model, identity, permit, durationMs: Date.now() - startedAt, success: false, errorCode })
        return {
          ok: false,
          content: "",
          error: err?.message || String(err),
          rateLimited: isRateLimited(err),
          retryAfterMs,
          errorCode,
        }
      }

      if (attempt === MAX_RETRIES) break
    }
  }

  const retryAfterMs = getRetryAfterMs(lastErr)
  await setAIProviderCooldown(providerKey, model, retryAfterMs)
  await reconcileAIBudget({ provider: providerKey, model, identity, permit, durationMs: Date.now() - startedAt, success: false, errorCode: "rate_limited" })
  return {
    ok: false,
    content: "",
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    rateLimited: true,
    retryAfterMs,
    errorCode: "rate_limited",
  }
}

function completionDedupeKey(options: ChatCompleteOptions): string {
  return createHash("sha256").update(JSON.stringify({ provider: getActiveProviderKey(), model: options.model || getModel(), userId: options.request?.userId || "system", feature: options.request?.feature || "unspecified", messages: options.messages, temperature: options.temperature, maxTokens: options.maxTokens, reasoningEffort: options.reasoningEffort })).digest("hex")
}

function extractUsage(completion: OpenAI.Chat.Completions.ChatCompletion): ChatCompleteResult["usage"] {
  const usage = completion.usage
  if (!usage) return undefined
  return {
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
  }
}

function supportsReasoningEffort(provider: string, model: string): boolean {
  if (provider === "groq") return /gpt-oss/i.test(model)
  if (provider === "openai") return /^(?:o[1-9]|gpt-5)/i.test(model)
  return false
}

function classifyAIError(err: unknown): AIErrorCode {
  const status = (err as { status?: number })?.status
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  if (isRateLimited(err)) return "rate_limited"
  if (status === 400 || status === 422) return "invalid_request"
  if (status === 401 || status === 403 || message.includes("api key") || message.includes("authentication")) return "configuration"
  if (message.includes("timeout") || message.includes("timed out") || status === 408) return "timeout"
  return "provider_unavailable"
}

function getRetryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: { get?: (name: string) => string | null } })?.headers
  const raw = headers?.get?.("retry-after")
  if (!raw) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1_000) : undefined
}
// ─────────────────────────────────────────────────────────────────────────────
// Sandbox chat completion — uses z-ai-web-dev-sdk
// This is the fallback that keeps the project working in the sandbox.
// ─────────────────────────────────────────────────────────────────────────────

async function chatCompleteSandbox(options: ChatCompleteOptions): Promise<ChatCompleteResult> {
  let lastErr: unknown

  for (let attempt = 0; attempt <= (options.noRetry ? 0 : MAX_RETRIES); attempt++) {
    try {
      const zai = await getZaiClient()
      const completion = await zai.chat.completions.create({
        messages: options.messages,
        temperature: options.temperature ?? getDefaultTemperature(),
        max_tokens: options.maxTokens ?? getDefaultMaxTokens(),
      })

      // Extract content — z-ai SDK returns different shapes
      let content = ""
      if (typeof completion === "string") {
        content = completion
      } else if (completion?.choices?.[0]?.message?.content) {
        content = completion.choices[0].message.content
      } else if (completion?.content) {
        content = completion.content
      } else {
        content = String(completion ?? "")
      }

      return { ok: true, content: content.trim() }
    } catch (err: any) {
      lastErr = err
      const retryAfterMs = getRetryAfterMs(err)
      if (options.noRetry || !isRateLimited(err)) {
        return {
          ok: false,
          content: "",
          error: err?.message || String(err),
          rateLimited: isRateLimited(err),
          retryAfterMs,
        }
      }
      if (attempt === MAX_RETRIES) break
    }
  }

  return {
    ok: false,
    content: "",
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    rateLimited: true,
    retryAfterMs: getRetryAfterMs(lastErr),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider status check — useful for diagnostics and settings UI
// ─────────────────────────────────────────────────────────────────────────────

export function getProviderStatus(): {
  provider: string
  providerName: string
  model: string
  configured: boolean
  missingEnvVar?: string
} {
  const providerKey = getActiveProviderKey()
  const config = PROVIDERS[providerKey]

  if (!config) {
    return {
      provider: providerKey,
      providerName: "Unknown",
      model: "unknown",
      configured: false,
      missingEnvVar: "AI_PROVIDER",
    }
  }

  // Sandbox and Ollama don't need an API key
  const needsKey = config.apiKeyRequired
  const missingEnvVar =
    needsKey && !config.apiKey
      ? {
          gemini: "GEMINI_API_KEY",
          groq: "GROQ_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
          openai: "OPENAI_API_KEY",
          custom: "AI_API_KEY",
        }[providerKey]
      : undefined

  return {
    provider: providerKey,
    providerName: config.name,
    model: process.env.AI_MODEL || config.defaultModel,
    configured: !missingEnvVar,
    missingEnvVar,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ASR (Automatic Speech Recognition) — for audio-to-note feature
// ─────────────────────────────────────────────────────────────────────────────
//
// The audio-to-note feature needs a speech-to-text service. We support:
//   1. OpenAI Whisper API (paid, but cheap — $0.006/min)
//   2. Groq Whisper (free tier — Whisper Large v3 Turbo)
//   3. Local whisper.cpp (100% free, runs on your machine)
//
// Set AI_PROVIDER to determine which ASR backend to use:
//   - groq → uses Groq's free Whisper endpoint
//   - openai → uses OpenAI's Whisper API
//   - ollama → not supported (Ollama doesn't do ASR — fall back to error message)

export async function transcribeAudio(
  audioBase64: string,
  mimeType: string = "audio/webm"
): Promise<{ ok: boolean; text: string; error?: string }> {
  const providerKey = getActiveProviderKey()

  // ── Sandbox fallback ──────────────────────────────────────────────────────
  // Uses z-ai-web-dev-sdk's ASR service directly
  if (providerKey === "sandbox") {
    try {
      const zai = await getZaiClient()
      const asrResult = await zai.audio.asr.create({ file_base64: audioBase64 })
      let text = ""
      if (typeof asrResult === "string") {
        text = asrResult
      } else if (asrResult?.text) {
        text = asrResult.text
      } else {
        text = String(asrResult ?? "")
      }
      return { ok: true, text }
    } catch (err: any) {
      return {
        ok: false,
        text: "",
        error: err?.message || String(err),
      }
    }
  }

  try {
    // Convert base64 to Blob for the OpenAI SDK
    const audioBuffer = Buffer.from(audioBase64, "base64")
    const audioBlob = new Blob([audioBuffer], { type: mimeType })
    const audioFile = new File([audioBlob], "audio.webm", { type: mimeType })

    if (providerKey === "groq") {
      // Groq offers free Whisper transcription
      const client = getAIClient()
      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-large-v3-turbo",
        response_format: "text",
      })
      return {
        ok: true,
        text: typeof transcription === "string" ? transcription : String(transcription ?? ""),
      }
    }

    if (providerKey === "openai") {
      // OpenAI Whisper API (paid)
      const client = getAIClient()
      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        response_format: "text",
      })
      return {
        ok: true,
        text: typeof transcription === "string" ? transcription : String(transcription ?? ""),
      }
    }

    // For Gemini, Ollama, OpenRouter — no direct ASR support
    // Fall back to an error message guiding the user
    return {
      ok: false,
      text: "",
      error:
        `Audio transcription is not supported with the "${providerKey}" provider. ` +
        `Set AI_PROVIDER=groq (free) or AI_PROVIDER=openai (paid) in your .env file ` +
        `to enable the audio-to-note feature.`,
    }
  } catch (err: any) {
    return {
      ok: false,
      text: "",
      error: err?.message || String(err),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Web page content extraction — for URL import feature
// ─────────────────────────────────────────────────────────────────────────────
//
// The URL import feature needs to fetch a web page and extract its content.
// We use a lightweight approach: fetch the HTML directly and convert to Markdown.
// No AI provider needed — this works with any setup.

export async function fetchWebPageContent(
  url: string
): Promise<{ ok: boolean; title: string; html: string; publishedTime?: string; url: string; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Memex/1.0; +https://github.com/yourusername/memex)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return { ok: false, title: "", html: "", url, error: `HTTP ${res.status} ${res.statusText}` }
    }

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { ok: false, title: "", html: "", url, error: `Unsupported content type: ${contentType}` }
    }

    const html = await res.text()

    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : url

    // Extract published time from meta tags
    const publishedMatch =
      html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i)
    const publishedTime = publishedMatch ? publishedMatch[1] : undefined

    return { ok: true, title, html, publishedTime, url }
  } catch (err: any) {
    return {
      ok: false,
      title: "",
      html: "",
      url,
      error: err?.message || String(err),
    }
  }
}
