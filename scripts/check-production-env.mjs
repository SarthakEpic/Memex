const required = []
const warnings = []

function env(name) {
  return process.env[name]?.trim() || ""
}

function requireValue(name, reason) {
  if (!env(name)) required.push(`${name}: ${reason}`)
}

requireValue("DATABASE_URL", "required by Prisma")
requireValue("ENCRYPTION_KEY", "encrypts stored email credentials")
requireValue("APP_BASE_URL", "builds password reset and email verification links")

if (env("DATABASE_URL") && !env("DATABASE_URL").startsWith("postgresql://")) {
  required.push("DATABASE_URL: production should use managed PostgreSQL, not SQLite")
}

if (env("ENCRYPTION_KEY") && env("ENCRYPTION_KEY").length < 32) {
  required.push("ENCRYPTION_KEY: use at least 32 random characters")
}

if (env("APP_BASE_URL") && !env("APP_BASE_URL").startsWith("https://")) {
  required.push("APP_BASE_URL: production must use an https:// URL")
}

if (env("RATE_LIMIT_BACKEND") !== "database") {
  warnings.push("RATE_LIMIT_BACKEND should be database for multi-instance deployments")
}

if (!env("CRON_SECRET")) {
  warnings.push("CRON_SECRET is recommended if you trigger /api/cron/scheduled outside Vercel Cron")
}

if (env("REQUIRE_EMAIL_VERIFICATION") === "true") {
  for (const name of ["AUTH_SMTP_HOST", "AUTH_SMTP_USER", "AUTH_SMTP_PASSWORD", "APP_EMAIL_FROM"]) {
    requireValue(name, "required when REQUIRE_EMAIL_VERIFICATION=true")
  }
}

const hasAiProvider =
  env("GEMINI_API_KEY") ||
  env("GROQ_API_KEY") ||
  env("OPENROUTER_API_KEY") ||
  env("OPENAI_API_KEY") ||
  env("OLLAMA_HOST") ||
  env("AI_API_KEY")

if (!hasAiProvider) {
  warnings.push("No AI provider key is configured; non-sandbox deployments will have limited AI features")
}

if (required.length > 0) {
  console.error("Production environment check failed:")
  for (const item of required) console.error(`- ${item}`)
  if (warnings.length > 0) {
    console.error("\nWarnings:")
    for (const item of warnings) console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log("Production environment check passed.")
if (warnings.length > 0) {
  console.log("Warnings:")
  for (const item of warnings) console.log(`- ${item}`)
}
