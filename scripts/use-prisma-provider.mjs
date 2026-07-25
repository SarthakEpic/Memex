import { copyFileSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const provider = process.argv[2]
const schemaPath = resolve("prisma/schema.prisma")
const postgresSchemaPath = resolve("prisma/schema.postgres.prisma")

if (!["postgres", "postgresql", "sqlite"].includes(provider)) {
  console.error("Usage: node scripts/use-prisma-provider.mjs <sqlite|postgres>")
  process.exit(1)
}

if (provider === "postgres" || provider === "postgresql") {
  copyFileSync(postgresSchemaPath, schemaPath)
  console.log("Switched Prisma schema to PostgreSQL.")
  process.exit(0)
}

const postgresSchema = readFileSync(postgresSchemaPath, "utf8")
const sqliteSchema = postgresSchema
  .replace(/Database: PostgreSQL \(production-ready\)/, "Database: SQLite (local development)")
  .replace(/provider = "postgresql"/, 'provider = "sqlite"')
  .replace(/  \/\/ Enable connection pooling on serverless platforms \(Vercel, etc\.\)\r?\n/g, "")
  .replace(/  \/\/ directUrl = env\("DIRECT_URL"\) \/\/ uncomment if using a pooled \+ direct URL setup\r?\n/g, "")
  .split(/\r?\n/)
  .map((line) => (line.trimStart().startsWith("//") ? line : line.replace(/\s+@db\.Text/g, "")))
  .join("\n")

writeFileSync(schemaPath, sqliteSchema)
console.log("Switched Prisma schema to SQLite.")
