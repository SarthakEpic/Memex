// Selects the Prisma schema provider before `prisma generate` runs, so a
// single `npm run build` works locally (SQLite) and on hosts where
// DATABASE_URL points at Postgres (Vercel, Docker, PaaS).
//
// Resolution order:
//   1. PRISMA_PROVIDER env var (explicit override, used by the Dockerfile)
//   2. DATABASE_URL scheme (postgresql://... -> postgres)
//   3. Fallback: sqlite
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const explicit = process.env.PRISMA_PROVIDER?.trim().toLowerCase()
const databaseUrl = process.env.DATABASE_URL?.trim() ?? ""

let provider
if (explicit === "postgres" || explicit === "postgresql" || explicit === "sqlite") {
  provider = explicit === "postgresql" ? "postgres" : explicit
} else if (databaseUrl.startsWith("postgres")) {
  provider = "postgres"
} else {
  provider = "sqlite"
}

const result = spawnSync(
  process.execPath,
  [resolve("scripts/use-prisma-provider.mjs"), provider],
  { stdio: "inherit" }
)

if (result.status !== 0) {
  console.error(`Failed to switch Prisma schema to ${provider}.`)
  process.exit(result.status ?? 1)
}
