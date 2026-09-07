import { afterEach, describe, expect, it, vi } from "vitest"
import { estimateTokens, getAIBudgetConfig } from "./budget"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("AI budget configuration", () => {
  it("uses conservative Groq defaults with safety and background reserves", () => {
    vi.stubEnv("AI_BUDGET_ENABLED", "true")
    const config = getAIBudgetConfig("groq")

    expect(config.enabled).toBe(true)
    expect(config.tokensPerDay).toBe(180_000)
    expect(config.backgroundTokensPerDay).toBe(40_000)
    expect(config.userTokensPerDay).toBe(180_000)
  })

  it("does not guess limits for providers without explicit budget settings", () => {
    expect(getAIBudgetConfig("openai").enabled).toBe(false)
  })

  it("honors explicit provider and per-user limits", () => {
    vi.stubEnv("AI_BUDGET_TPD", "10000")
    vi.stubEnv("AI_BUDGET_PER_USER_TPD", "2500")
    vi.stubEnv("AI_BUDGET_BACKGROUND_TPD", "1000")
    vi.stubEnv("AI_BUDGET_SAFETY_PERCENT", "20")

    const config = getAIBudgetConfig("custom")
    expect(config.enabled).toBe(true)
    expect(config.tokensPerDay).toBe(8_000)
    expect(config.userTokensPerDay).toBe(2_500)
    expect(config.backgroundTokensPerDay).toBe(1_000)
  })

  it("accounts for prompt and maximum response size before admission", () => {
    const short = estimateTokens([{ content: "hello" }], 100)
    const long = estimateTokens([{ content: "x".repeat(3_500) }], 100)

    expect(short).toBeGreaterThanOrEqual(100)
    expect(long - short).toBeGreaterThanOrEqual(990)
  })
})
