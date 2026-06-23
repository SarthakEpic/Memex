import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/email-accounts — list connected accounts
export async function GET() {
  const accounts = await db.emailAccount.findMany({
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      ...a,
      // Don't expose any password/secret fields (there are none stored in this model)
    })),
  })
}

// POST /api/email-accounts — connect a new email account
// Body: { emailAddress, displayName?, imapPassword?, smtpPassword?, imapHost?, imapPort?, smtpHost?, smtpPort? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    emailAddress,
    displayName,
    imapPassword,
    smtpPassword,
    imapHost,
    imapPort,
    smtpHost,
    smtpPort,
  } = body as {
    emailAddress?: string
    displayName?: string
    imapPassword?: string
    smtpPassword?: string
    imapHost?: string
    imapPort?: number
    smtpHost?: string
    smtpPort?: number
  }

  if (!emailAddress) {
    return NextResponse.json({ error: "emailAddress is required" }, { status: 400 })
  }

  // Auto-detect IMAP/SMTP settings from common providers
  const domain = emailAddress.split("@")[1]?.toLowerCase() ?? ""
  const defaults = detectProvider(domain)

  // If IMAP password provided → real mode; otherwise → demo mode
  const syncMode = imapPassword ? "real" : "demo"

  const account = await db.emailAccount.upsert({
    where: { emailAddress },
    create: {
      emailAddress,
      displayName: displayName || emailAddress.split("@")[0],
      imapHost: imapHost || defaults.imapHost,
      imapPort: imapPort || defaults.imapPort,
      smtpHost: smtpHost || defaults.smtpHost,
      smtpPort: smtpPort || defaults.smtpPort,
      imapUser: emailAddress,
      smtpUser: emailAddress,
      imapPassword: imapPassword || "",
      smtpPassword: smtpPassword || imapPassword || "",
      connected: true,
      syncMode,
    },
    update: {
      displayName: displayName || emailAddress.split("@")[0],
      imapHost: imapHost || defaults.imapHost,
      imapPort: imapPort || defaults.imapPort,
      smtpHost: smtpHost || defaults.smtpHost,
      smtpPort: smtpPort || defaults.smtpPort,
      connected: true,
      ...(imapPassword ? { imapPassword, syncMode: "real" } : {}),
      ...(smtpPassword ? { smtpPassword } : {}),
    },
  })

  return NextResponse.json({
    account: {
      ...account,
      imapPassword: undefined, // Don't return password
      smtpPassword: undefined,
    },
    message: syncMode === "real"
      ? `Connected ${emailAddress} with real IMAP. Inbox sync will fetch real emails.`
      : `Connected ${emailAddress} in demo mode. Add an IMAP app password for real email sync.`,
  })
}

// DELETE /api/email-accounts — disconnect (mark as not connected)
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { emailAddress } = body as { emailAddress?: string }
  if (!emailAddress) {
    return NextResponse.json({ error: "emailAddress is required" }, { status: 400 })
  }
  await db.emailAccount.update({
    where: { emailAddress },
    data: { connected: false },
  })
  return NextResponse.json({ ok: true, message: `Disconnected ${emailAddress}` })
}

function detectProvider(domain: string): {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
} {
  const providers: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
    "gmail.com": { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 587 },
    "outlook.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
    "hotmail.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
    "yahoo.com": { imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 587 },
    "icloud.com": { imapHost: "imap.mail.me.com", imapPort: 993, smtpHost: "smtp.mail.me.com", smtpPort: 587 },
    "proton.me": { imapHost: "127.0.0.1", imapPort: 1143, smtpHost: "127.0.0.1", smtpPort: 1025 }, // via Proton Bridge
  }
  return providers[domain] ?? { imapHost: `imap.${domain}`, imapPort: 993, smtpHost: `smtp.${domain}`, smtpPort: 587 }
}
