import { cpSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const standaloneDir = resolve(root, ".next", "standalone")

if (!existsSync(standaloneDir)) {
  throw new Error("Standalone output is missing. Run `next build` first.")
}

for (const [source, destination] of [
  [resolve(root, "public"), resolve(standaloneDir, "public")],
  [resolve(root, ".next", "static"), resolve(standaloneDir, ".next", "static")],
]) {
  if (!existsSync(source)) continue
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true, force: true })
}

console.log("Prepared standalone production assets.")
