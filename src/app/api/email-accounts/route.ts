import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { encryptSecret } from "@/server/security/encryption"
import {
  emailAccountCreateSchema,
  emailAccountDeleteSchema,
  validationError,
} from "@/server/validation/api"

// GET /api/email-accounts — list connected accounts
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const accounts = await db.emailAccount.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({
    accounts: accounts.map(toSafeEmailAccount),
  })
}

// POST /api/email-accounts — connect a new email account WITH VERIFICATION
// Body: { emailAddress, displayName?, imapPassword?, smtpPassword? }
// If imapPassword is provided → tries to connect via IMAP to verify credentials
// If no password → connects in demo mode (no verification needed)
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const parsed = emailAccountCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { emailAddress, displayName, imapPassword, smtpPassword } = parsed.data

  // Auto-detect IMAP/SMTP settings from common providers
  const domain = emailAddress.split("@")[1]?.toLowerCase() ?? ""
  const defaults = detectProvider(domain)

  // If password provided, VERIFY the IMAP connection before saving
  if (imapPassword) {
    try {
      const { ImapFlow } = await import("imapflow")
      const client = new ImapFlow({
        host: defaults.imapHost,
        port: defaults.imapPort,
        secure: true,
        auth: {
          user: emailAddress,
          pass: imapPassword,
        },
        logger: false,
      })

      // Try to connect — this will throw if credentials are wrong
      await client.connect()
      await client.logout()

      const encryptedImapPassword = encryptSecret(imapPassword)
      const encryptedSmtpPassword = encryptSecret(smtpPassword || imapPassword)

      // Connection succeeded — save the account as "real" mode
      const account = await db.emailAccount.upsert({
        where: { userId_emailAddress: { userId: auth.user.id, emailAddress } },
        create: {
          userId: auth.user.id,
          emailAddress,
          displayName: displayName || emailAddress.split("@")[0],
          imapHost: defaults.imapHost,
          imapPort: defaults.imapPort,
          smtpHost: defaults.smtpHost,
          smtpPort: defaults.smtpPort,
          imapUser: emailAddress,
          smtpUser: emailAddress,
          imapPassword: encryptedImapPassword,
          smtpPassword: encryptedSmtpPassword,
          connected: true,
          syncMode: "real",
        },
        update: {
          displayName: displayName || emailAddress.split("@")[0],
          imapHost: defaults.imapHost,
          imapPort: defaults.imapPort,
          smtpHost: defaults.smtpHost,
          smtpPort: defaults.smtpPort,
          imapPassword: encryptedImapPassword,
          smtpPassword: encryptedSmtpPassword,
          connected: true,
          syncMode: "real",
        },
      })

      return NextResponse.json({
        account: toSafeEmailAccount(account),
        verified: true,
        syncMode: "real",
        message: `Verified. Connected to ${emailAddress} via IMAP. Real email sync is ready.`,
      })
    } catch (err: any) {
      // IMAP connection failed — wrong password or server issue
      const errorMsg = err?.message || "Unknown error"
      let friendlyError = "Could not connect to your email server."

      if (errorMsg.includes("Authentication") || errorMsg.includes("auth") || errorMsg.includes("password") || errorMsg.includes("credentials")) {
        friendlyError = "Wrong email or password. For Gmail, use an App Password (not your regular password). Go to myaccount.google.com/apppasswords to create one."
      } else if (errorMsg.includes("connect") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout")) {
        friendlyError = `Could not reach ${defaults.imapHost}. Check your internet connection or try a different email provider.`
      } else if (errorMsg.includes("ENOTFOUND")) {
        friendlyError = `Email server ${defaults.imapHost} not found. Check if your email address is correct.`
      }

      return NextResponse.json(
        { error: friendlyError, detail: errorMsg, verified: false },
        { status: 401 }
      )
    }
  }

  // No password → demo mode (no verification needed)
  const account = await db.emailAccount.upsert({
    where: { userId_emailAddress: { userId: auth.user.id, emailAddress } },
    create: {
      userId: auth.user.id,
      emailAddress,
      displayName: displayName || emailAddress.split("@")[0],
      imapHost: defaults.imapHost,
      imapPort: defaults.imapPort,
      smtpHost: defaults.smtpHost,
      smtpPort: defaults.smtpPort,
      imapUser: emailAddress,
      smtpUser: emailAddress,
      connected: true,
      syncMode: "demo",
    },
    update: {
      displayName: displayName || emailAddress.split("@")[0],
      imapHost: defaults.imapHost,
      imapPort: defaults.imapPort,
      smtpHost: defaults.smtpHost,
      smtpPort: defaults.smtpPort,
      connected: true,
      syncMode: "demo",
    },
  })

  return NextResponse.json({
    account: toSafeEmailAccount(account),
    verified: true,
    syncMode: "demo",
    message: `Connected ${emailAddress} in demo mode. Sync will generate sample emails. Add an IMAP password for real email sync.`,
  })
}

// DELETE /api/email-accounts — disconnect
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const parsed = emailAccountDeleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  await db.emailAccount.updateMany({
    where: { userId: auth.user.id, emailAddress: parsed.data.emailAddress },
    data: { connected: false },
  })
  return NextResponse.json({ ok: true, message: `Disconnected ${parsed.data.emailAddress}` })
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
    "live.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  }
  return providers[domain] ?? { imapHost: `imap.${domain}`, imapPort: 993, smtpHost: `smtp.${domain}`, smtpPort: 587 }
}

function toSafeEmailAccount(account: {
  id: string
  emailAddress: string
  displayName: string
  imapHost: string
  imapPort: number
  imapUser: string
  imapSecure: boolean
  imapPassword: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpSecure: boolean
  smtpPassword: string
  connected: boolean
  lastSyncAt: Date | null
  syncMode: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: account.id,
    emailAddress: account.emailAddress,
    displayName: account.displayName,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapUser: account.imapUser,
    imapSecure: account.imapSecure,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpUser: account.smtpUser,
    smtpSecure: account.smtpSecure,
    connected: account.connected,
    lastSyncAt: account.lastSyncAt,
    syncMode: account.syncMode,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    hasImapPassword: Boolean(account.imapPassword),
    hasSmtpPassword: Boolean(account.smtpPassword),
  }
}
