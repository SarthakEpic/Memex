import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"
import { logInfo, logWarn } from "@/server/observability/logger"

export type AIWorkClass = "interactive" | "background"

export type AIRequestIdentity = {
  userId?: string
  feature: string
  workClass: AIWorkClass
}

export type AIBudgetConfig = {
  enabled: boolean
  requestsPerMinute: number
  requestsPerDay: number
  tokensPerMinute: number
  tokensPerDay: number
  backgroundTokensPerDay: number
  userTokensPerDay: number
}

export type AIBudgetPermit = {
  admitted: boolean
  reservationId: string
  reservedTokens: number
  retryAt?: Date
  reason?: "cooldown" | "request_minute" | "request_day" | "token_minute" | "token_day" | "background_day" | "user_day"
  bucketKeys: string[]
}

type BucketSpec = {
  key: string
  userId?: string
  amount: number
  limit: number
  resetAt: Date
  reason: NonNullable<AIBudgetPermit["reason"]>
}

const DEFAULT_GROQ_LIMITS = {
  requestsPerMinute: 30,
  requestsPerDay: 1_000,
  tokensPerMinute: 8_000,
  tokensPerDay: 200_000,
}

export function estimateTokens(messages: Array<{ content: string }>, maxOutputTokens: number): number {
  const inputChars = messages.reduce((total, message) => total + message.content.length, 0)
  const estimatedInput = Math.ceil(inputChars / 3.5) + messages.length * 8
  return Math.max(1, estimatedInput + Math.max(1, maxOutputTokens))
}

export function getAIBudgetConfig(provider: string): AIBudgetConfig {
  const defaults = provider === "groq" ? DEFAULT_GROQ_LIMITS : {
    requestsPerMinute: 0,
    requestsPerDay: 0,
    tokensPerMinute: 0,
    tokensPerDay: 0,
  }
  const tokensPerDay = positiveEnv("AI_BUDGET_TPD", defaults.tokensPerDay)
  const safetyPercent = boundedEnv("AI_BUDGET_SAFETY_PERCENT", 10, 0, 50)
  const usableDailyTokens = Math.floor(tokensPerDay * (100 - safetyPercent) / 100)
  return {
    enabled: process.env.AI_BUDGET_ENABLED !== "false" && (provider === "groq" || hasConfiguredLimit()),
    requestsPerMinute: positiveEnv("AI_BUDGET_RPM", defaults.requestsPerMinute),
    requestsPerDay: positiveEnv("AI_BUDGET_RPD", defaults.requestsPerDay),
    tokensPerMinute: positiveEnv("AI_BUDGET_TPM", defaults.tokensPerMinute),
    tokensPerDay: usableDailyTokens,
    backgroundTokensPerDay: positiveEnv("AI_BUDGET_BACKGROUND_TPD", Math.floor(tokensPerDay * 0.2)),
    userTokensPerDay: positiveEnv("AI_BUDGET_PER_USER_TPD", usableDailyTokens),
  }
}

export async function reserveAIBudget(input: {
  provider: string
  model: string
  identity: AIRequestIdentity
  estimatedTokens: number
}): Promise<AIBudgetPermit> {
  const config = getAIBudgetConfig(input.provider)
  const reservationId = randomUUID()
  if (!config.enabled) {
    return { admitted: true, reservationId, reservedTokens: input.estimatedTokens, bucketKeys: [] }
  }

  const namespace = budgetNamespace(input.provider, input.model)
  const cooldown = await db.rateLimitBucket.findUnique({ where: { key: `${namespace}:cooldown` } })
  if (cooldown && cooldown.resetAt > new Date()) {
    return { admitted: false, reservationId, reservedTokens: 0, retryAt: cooldown.resetAt, reason: "cooldown", bucketKeys: [] }
  }

  const now = new Date()
  const minuteReset = new Date(now.getTime() + 60_000)
  const dayReset = nextUtcDay(now)
  const specs: BucketSpec[] = [
    bucket(`${namespace}:requests:minute`, 1, config.requestsPerMinute, minuteReset, "request_minute"),
    bucket(`${namespace}:requests:day`, 1, config.requestsPerDay, dayReset, "request_day"),
    bucket(`${namespace}:tokens:minute`, input.estimatedTokens, config.tokensPerMinute, minuteReset, "token_minute"),
    bucket(`${namespace}:tokens:day`, input.estimatedTokens, config.tokensPerDay, dayReset, "token_day"),
  ]
  if (input.identity.workClass === "background") {
    specs.push(bucket(`${namespace}:tokens:background:day`, input.estimatedTokens, config.backgroundTokensPerDay, dayReset, "background_day"))
  }
  if (input.identity.userId) {
    specs.push(bucket(`${namespace}:tokens:user:${input.identity.userId}:day`, input.estimatedTokens, config.userTokensPerDay, dayReset, "user_day", input.identity.userId))
  }
  const active = specs.filter((spec) => spec.limit > 0)
  const oversized = active.find((spec) => spec.amount > spec.limit)
  if (oversized) {
    logInfo("ai.budget_rejected", safeFields(input, { reason: oversized.reason, retryAt: oversized.resetAt.toISOString(), oversized: true }))
    return { admitted: false, reservationId, reservedTokens: 0, retryAt: oversized.resetAt, reason: oversized.reason, bucketKeys: [] }
  }
  for (const spec of active) {
    await db.rateLimitBucket.upsert({
      where: { key: spec.key },
      create: { key: spec.key, userId: spec.userId, count: 0, resetAt: spec.resetAt },
      update: {},
    })
    await db.rateLimitBucket.updateMany({
      where: { key: spec.key, resetAt: { lte: now } },
      data: { count: 0, resetAt: spec.resetAt },
    })
  }

  try {
    await db.$transaction(async (transaction) => {
      for (const spec of active) {
        const updated = await transaction.rateLimitBucket.updateMany({
          where: { key: spec.key, resetAt: { gt: now }, count: { lte: Math.max(0, spec.limit - spec.amount) } },
          data: { count: { increment: spec.amount } },
        })
        if (updated.count !== 1) throw new BudgetRejected(spec.reason, spec.resetAt)
      }
    })
  } catch (error) {
    if (error instanceof BudgetRejected) {
      logInfo("ai.budget_rejected", safeFields(input, { reason: error.reason, retryAt: error.retryAt.toISOString() }))
      return { admitted: false, reservationId, reservedTokens: 0, retryAt: error.retryAt, reason: error.reason, bucketKeys: [] }
    }
    throw error
  }

  logInfo("ai.budget_reserved", safeFields(input, { reservationId, estimatedTokens: input.estimatedTokens }))
  return { admitted: true, reservationId, reservedTokens: input.estimatedTokens, bucketKeys: active.filter((spec) => spec.amount === input.estimatedTokens).map((spec) => spec.key) }
}

export async function reconcileAIBudget(input: {
  provider: string
  model: string
  identity: AIRequestIdentity
  permit: AIBudgetPermit
  actualTokens?: number
  promptTokens?: number
  completionTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  durationMs: number
  success: boolean
  errorCode?: string
}): Promise<void> {
  if (!input.permit.admitted) return
  const actual = input.actualTokens ?? input.permit.reservedTokens
  const delta = actual - input.permit.reservedTokens
  if (delta !== 0 && input.permit.bucketKeys.length > 0) {
    await Promise.all(input.permit.bucketKeys.map((key) => db.rateLimitBucket.updateMany({
      where: { key },
      data: { count: { increment: delta } },
    }))).catch((error) => {
      logWarn("ai.budget_reconcile_failed", {
        reservationId: input.permit.reservationId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
  logInfo("ai.request_completed", safeFields(input, {
    reservationId: input.permit.reservationId,
    success: input.success,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    cachedTokens: input.cachedTokens,
    reasoningTokens: input.reasoningTokens,
    totalTokens: actual,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
  }))
}

export async function setAIProviderCooldown(provider: string, model: string, retryAfterMs?: number): Promise<void> {
  if (!retryAfterMs || retryAfterMs <= 0) return
  const key = `${budgetNamespace(provider, model)}:cooldown`
  const resetAt = new Date(Date.now() + Math.min(retryAfterMs, 24 * 60 * 60_000))
  await db.rateLimitBucket.upsert({
    where: { key },
    create: { key, count: 1, resetAt },
    update: { count: 1, resetAt },
  }).catch((error) => logWarn("ai.cooldown_store_failed", { error: error instanceof Error ? error.message : String(error) }))
}

export async function getAIBudgetSnapshot(provider: string, model: string, userId?: string) {
  const config = getAIBudgetConfig(provider)
  if (!config.enabled) return { enabled: false, configuredLimits: config }
  const namespace = budgetNamespace(provider, model)
  const keys = [`${namespace}:requests:minute`, `${namespace}:requests:day`, `${namespace}:tokens:minute`, `${namespace}:tokens:day`, `${namespace}:tokens:background:day`, `${namespace}:cooldown`]
  if (userId) keys.push(`${namespace}:tokens:user:${userId}:day`)
  const rows = await db.rateLimitBucket.findMany({ where: { key: { in: keys } }, select: { key: true, count: true, resetAt: true } })
  const values = Object.fromEntries(rows.filter((row) => row.resetAt > new Date()).map((row) => {
    const rawKey = row.key.slice(namespace.length + 1)
    const key = rawKey.startsWith("tokens:user:") ? "tokens:user:day" : rawKey
    return [key, { used: row.count, resetAt: row.resetAt.toISOString() }]
  }))
  return { enabled: true, configuredLimits: config, usage: values }
}

function bucket(key: string, amount: number, limit: number, resetAt: Date, reason: BucketSpec["reason"], userId?: string): BucketSpec {
  return { key, amount, limit, resetAt, reason, userId }
}

function nextUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

function budgetNamespace(provider: string, model: string): string {
  return `ai:budget:${safeKey(provider)}:${safeKey(model)}`
}

function safeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 120)
}

function positiveEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function boundedEnv(name: string, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, positiveEnv(name, fallback)))
}

function hasConfiguredLimit(): boolean {
  return ["AI_BUDGET_RPM", "AI_BUDGET_RPD", "AI_BUDGET_TPM", "AI_BUDGET_TPD"].some((name) => Boolean(process.env[name]))
}

function safeFields(input: { provider: string; model: string; identity: AIRequestIdentity }, extra: Record<string, unknown>) {
  return { provider: input.provider, model: input.model, feature: input.identity.feature, workClass: input.identity.workClass, hasUser: Boolean(input.identity.userId), ...extra }
}

class BudgetRejected extends Error {
  constructor(readonly reason: NonNullable<AIBudgetPermit["reason"]>, readonly retryAt: Date) {
    super(reason)
  }
}
