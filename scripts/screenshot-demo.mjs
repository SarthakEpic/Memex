// Captures README screenshots of the demo workspace (you@memex.local).
// The workspace is a single-page app: sections switch via the sidebar, so we
// click through it rather than navigating to URLs.
//
// Run against a fresh seeded SQLite DB, e.g.:
//   DATABASE_URL="file:./db/screenshots.db" npx prisma db push --skip-generate
//   DATABASE_URL="file:./db/screenshots.db" node --no-warnings scripts/seed-demo.mjs
//   DATABASE_URL="file:./db/screenshots.db" npm run dev
//   node scripts/screenshot-demo.mjs
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import puppeteer from "puppeteer-core"

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
]
const BASE = process.env.MEMEX_BASE_URL ?? "http://localhost:3000"
const OUT_DIR = resolve("docs", "screenshots")
const VIEWPORT = { width: 1600, height: 900 }

async function launch() {
  const fs = await import("node:fs")
  const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p))
  if (!executablePath) throw new Error("No Chrome/Edge executable found")
  return puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--hide-scrollbars", "--no-first-run", "--force-device-scale-factor=2"],
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function settle(page, ms = 1500) {
  await sleep(ms)
  try {
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 })
  } catch {}
}

async function shoot(page, name) {
  mkdirSync(OUT_DIR, { recursive: true })
  const file = resolve(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`saved ${file}`)
}

// Clicks the sidebar entry whose full trimmed text equals `label` (the
// workspace switches sections without URL changes).
async function clickNav(page, label) {
  const clicked = await page.evaluate((wanted) => {
    const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim()
    const candidates = [...document.querySelectorAll("button, a, [role='button'], [role='link']")]
    const match = candidates.filter((el) => {
      const t = norm(el.textContent)
      return t === wanted || (t.startsWith(wanted) && t.length <= wanted.length + 40)
    })
    const target =
      match.find((el) => el.closest("aside, nav, [class*='sidebar']")) ?? match[0]
    if (!target) return false
    target.click()
    return true
  }, label)
  if (!clicked) throw new Error(`Sidebar entry not found: ${label}`)
}

// Dismisses the onboarding tour if it is showing.
async function dismissTour(page) {
  for (let i = 0; i < 12; i++) {
    const skipped = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")]
      const skip = buttons.find((b) => /skip tour/i.test(b.textContent ?? ""))
      if (skip) {
        skip.click()
        return true
      }
      return false
    })
    if (!skipped) break
    await sleep(600)
  }
}

async function text(page) {
  return page.evaluate(() => document.body.innerText)
}

const browser = await launch()
try {
  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)

  // 1. Log in as the demo user.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" })
  await settle(page, 1000)
  await page.type('input[type="email"], input[name="email"]', "you@memex.local", { delay: 10 })
  await page.type('input[type="password"], input[name="password"]', "memex-demo-password", { delay: 10 })
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 })
  await settle(page, 2500)
  await dismissTour(page)
  await settle(page, 1000)

  // 2. Home (workspace overview).
  await clickNav(page, "Home")
  await settle(page, 2000)
  await shoot(page, "overview")

  // 3. Notes, with the first note open so the editor pane is visible.
  await clickNav(page, "Notes")
  await settle(page, 2500)
  await page.evaluate(() => {
    const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim()
    const title = "Portfolio Reviewer Walkthrough"
    const all = [...document.querySelectorAll("*")].filter((el) => norm(el.textContent) === title)
    // Innermost element carrying the title; the click bubbles to the note card.
    all[all.length - 1]?.click()
  })
  await settle(page, 5000)
  await shoot(page, "notes")

  // 4. Chat with a cited answer.
  await clickNav(page, "Chat")
  await settle(page, 2000)
  const chatInput = await page.$("textarea")
  if (chatInput) {
    await chatInput.type("Why did we pick Postgres as the database?", { delay: 10 })
    await page.keyboard.press("Enter")
    let last = ""
    for (let i = 0; i < 60; i++) {
      await sleep(1500)
      const current = await text(page)
      if (current.includes("Postgres") && current.length > last.length + 20) {
        last = current
        continue
      }
      if (current.length === last.length && last.length > 0) break
      last = current
    }
    await settle(page, 1500)
  }
  await shoot(page, "chat")

  // 5. Smart Inbox (under Email in the sidebar). The Email row toggles its
  // submenu, so only click it when the entry is not already visible.
  const inboxVisible = async () =>
    page.evaluate(() => {
      const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim()
      return [...document.querySelectorAll("button, a")].some((el) =>
        norm(el.textContent).startsWith("Smart Inbox"),
      )
    })
  if (!(await inboxVisible())) {
    await clickNav(page, "Email")
    await settle(page, 1200)
  }
  try {
    await clickNav(page, "Smart Inbox")
  } catch {
    console.warn("Smart Inbox entry not found; shooting current Email view")
  }
  await settle(page, 2500)
  await shoot(page, "inbox")
} finally {
  await browser.close()
}
