import { spawnSync } from "node:child_process"

const scripts = ["db:generate", "db:init-sqlite", "lint", "typecheck", "test", "build", "smoke"]
const npmExecPath = process.env.npm_execpath

for (const script of scripts) {
  console.log(`\n> npm run ${script}`)
  const result = runNpmScript(script)
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runNpmScript(script) {
  if (npmExecPath) {
    return spawnSync(process.execPath, [npmExecPath, "run", script], {
      stdio: "inherit",
      shell: false,
    })
  }

  return spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  })
}
