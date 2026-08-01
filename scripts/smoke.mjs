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
let sessionCookie = ""
let createdNoteId = ""
let createdEmailId = ""

child.stdout.on("data", (chunk) => {
  output += chunk.toString()
})
child.stderr.on("data", (chunk) => {
  output += chunk.toString()
})

try {
  await waitForServer()
  sessionCookie = await getSessionCookie()
  const authHeaders = { cookie: sessionCookie }

  await assertOk("/", authHeaders)
  for (const pathname of [
    "/api/auth/me",
    "/api/stats",
    "/api/notes",
    "/api/decisions",
    "/api/timeline",
    "/api/analytics",
    "/api/email-accounts",
    "/api/inbox",
    "/api/emails",
    "/api/profile",
    "/api/ai-status",
    "/api/chat/sessions",
  ]) {
    await assertOk(pathname, authHeaders)
  }

  const suffix = Date.now().toString(36)
  const createdNote = await requestJson("/api/notes", {
    method: "POST",
    body: {
      title: `Smoke lifecycle ${suffix}`,
      content: "# Smoke lifecycle\n\nThe production smoke test validates note persistence.",
      project: "smoke",
      tags: ["smoke", "ci"],
      extractDecisions: false,
    },
  })
  createdNoteId = createdNote.id
  assert(createdNoteId, "Note creation did not return an id.")

  const noteDetail = await requestJson(`/api/notes/${createdNoteId}`)
  assert(
    noteDetail.note?.content?.includes("validates note persistence"),
    "Created note could not be read back."
  )

  const updatedNote = await requestJson(`/api/notes/${createdNoteId}`, {
    method: "PATCH",
    body: {
      title: `Smoke lifecycle updated ${suffix}`,
      content: `${noteDetail.note.content}\n\nUpdate verified.`,
      extractDecisions: false,
    },
  })
  assert(
    updatedNote.title === `Smoke lifecycle updated ${suffix}`,
    "Note update was not persisted."
  )

  const timeline = await requestJson("/api/timeline")
  assert(
    timeline.events?.some((event) => event.id === createdNoteId),
    "Created note did not appear in the timeline."
  )

  const accountData = await requestJson("/api/email-accounts")
  const hasLiveSmtp = accountData.accounts?.some(
    (account) =>
      account.connected &&
      account.syncMode === "real" &&
      account.hasSmtpPassword
  )

  if (!hasLiveSmtp) {
    const email = await requestJson("/api/emails", {
      method: "POST",
      body: {
        toAddress: smokeEmail,
        subject: `Smoke local delivery ${suffix}`,
        bodyMarkdown: "This message must remain local when SMTP is not configured.",
        sourceType: "manual",
      },
    })
    createdEmailId = email.id
    assert(email.status === "saved", `Expected local email status "saved", got "${email.status}".`)
    assert(email.delivered === false, "A local-only email was incorrectly marked delivered.")
    assert(email.deliveryMode === "local", "A local-only email did not record local delivery mode.")
  }

  const invalidProfile = await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: requestHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ smtpHost: "should-not-be-accepted.example" }),
    cache: "no-store",
  })
  assert(
    invalidProfile.status === 400,
    `Unsupported profile fields should return 400, got ${invalidProfile.status}.`
  )

  console.log(`Smoke test passed: authenticated API and data lifecycle at ${baseUrl}`)
} finally {
  if (sessionCookie) {
    if (createdEmailId) {
      await requestJson(`/api/emails/${createdEmailId}`, { method: "DELETE" }).catch(() => {})
    }
    if (createdNoteId) {
      await requestJson(`/api/notes/${createdNoteId}`, { method: "DELETE" }).catch(() => {})
    }
  }
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
      // Wait for the standalone server to bind.
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
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify(credentials),
    cache: "no-store",
  })

  if (res.status === 409) {
    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
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
  const cookie = setCookie?.split(";")[0]
  if (!cookie) {
    throw new Error(`Smoke auth did not return a session cookie.\n${output}`)
  }
  return cookie
}

async function requestJson(pathname, options = {}) {
  const headers = requestHeaders(
    options.body === undefined ? options.headers : { "content-type": "application/json", ...options.headers }
  )
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(
      `Expected ${pathname} to return 2xx, got ${res.status}.\n${JSON.stringify(body)}\n${output}`
    )
  }
  return body
}

async function assertOk(pathname, headers = undefined) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    cache: "no-store",
    headers: { origin: baseUrl, ...headers },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Expected ${pathname} to return 2xx, got ${res.status}.\n${body}\n${output}`)
  }
}

function requestHeaders(headers = {}) {
  return { origin: baseUrl, cookie: sessionCookie, ...headers }
}

function assert(condition, message) {
  if (!condition) throw new Error(`${message}\n${output}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
