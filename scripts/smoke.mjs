import { existsSync } from "node:fs"
import { spawn } from "node:child_process"

const port = process.env.SMOKE_PORT || "3110"
const baseUrl = `http://127.0.0.1:${port}`
const serverPath = ".next/standalone/server.js"
const smokeEmail = process.env.SMOKE_EMAIL || "smoke@memex.local"
const smokePassword = process.env.SMOKE_PASSWORD || "memex-smoke-password"

if (!existsSync(serverPath)) {
  console.error(`Missing ${serverPath}. Run npm run build before npm run smoke.`)
  process.exit(1)
}

const child = spawn(process.execPath, ["-r", "dotenv/config", serverPath], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: port,
  },
  stdio: ["ignore", "pipe", "pipe"],
})

let output = ""
child.stdout.on("data", (chunk) => {
  output += chunk.toString()
})
child.stderr.on("data", (chunk) => {
  output += chunk.toString()
})

try {
  await waitForServer()
  const sessionCookie = await getSessionCookie()
  const authHeaders = { cookie: sessionCookie }
  await assertOk("/", authHeaders)
  await assertOk("/api/stats", authHeaders)
  console.log(`Smoke test passed: ${baseUrl}`)
} finally {
  child.kill()
}

async function waitForServer() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 30_000) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}\n${output}`)
    }

    try {
      const res = await fetch(`${baseUrl}/login`, { cache: "no-store" })
      if (res.ok) return
    } catch {
      // wait and retry
    }

    await sleep(500)
  }

  throw new Error(`Server did not become ready within 30s.\n${output}`)
}

async function getSessionCookie() {
  const credentials = {
    email: smokeEmail,
    name: "Smoke Test",
    password: smokePassword,
  }
  let res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
    cache: "no-store",
  })

  if (res.status === 409) {
    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: smokeEmail,
        password: smokePassword,
      }),
      cache: "no-store",
    })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Smoke auth failed with ${res.status}.\n${body}\n${output}`)
  }

  const setCookie = res.headers.get("set-cookie")
  const sessionCookie = setCookie?.split(";")[0]
  if (!sessionCookie) {
    throw new Error(`Smoke auth did not return a session cookie.\n${output}`)
  }
  return sessionCookie
}

async function assertOk(pathname, headers = undefined) {
  const res = await fetch(`${baseUrl}${pathname}`, { cache: "no-store", headers })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Expected ${pathname} to return 2xx, got ${res.status}.\n${body}\n${output}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
