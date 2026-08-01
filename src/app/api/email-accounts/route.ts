import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { encryptSecret } from "@/server/security/encryption"
import { disconnectOAuthAccount } from "@/server/email/oauth"
import { rateLimit } from "@/server/security/rate-limit"
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

// POST /api/email-accounts — advanced app-password fallback.
// Gmail and Microsoft should use the OAuth routes so Memex never handles a mailbox password.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const limited = await rateLimit(req, {
    name: "email-accounts:connect",
    limit: 10,
    windowMs: 5 * 60_000,
    userId: auth.user.id,
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = emailAccountCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { emailAddress, displayName, imapPassword, smtpPassword } = parsed.data

  if (!imapPassword) {
    return NextResponse.json(
      { error: "Use Google or Microsoft connection for password-free access. Advanced IMAP requires an app password." },
      { status: 400 }
    )
  }

  // Auto-detect IMAP/SMTP settings from common providers
  const domain = emailAddress.split("@")[1]?.toLowerCase() ?? ""
  const defaults = detectProvider(domain)
  if (!defaults) {
    return NextResponse.json(
      {
        error:
          "This provider is not supported by safe auto-detection. Use Gmail, Outlook/Hotmail/Live, Yahoo, or iCloud.",
      },
      { status: 400 }
    )
  }

  // Verify the explicit advanced IMAP/SMTP fallback before saving.
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

      const smtpCredential = smtpPassword || imapPassword
      const nodemailer = await import("nodemailer")
      const smtpTransport = nodemailer.createTransport({
        host: defaults.smtpHost,
        port: defaults.smtpPort,
        secure: defaults.smtpPort === 465,
        auth: { user: emailAddress, pass: smtpCredential },
      })
      await smtpTransport.verify()

      const encryptedImapPassword = encryptSecret(imapPassword)
      const encryptedSmtpPassword = encryptSecret(smtpPassword || imapPassword)

      // Connection succeeded — save the account as "real" mode
      const account = await db.emailAccount.upsert({
        where: { userId_emailAddress: { userId: auth.user.id, emailAddress } },
        create: {
          userId: auth.user.id,
          emailAddress,
          displayName: displayName || emailAddress.split("@")[0],
          provider: "manual",
          oauthAccessToken: "",
          oauthRefreshToken: "",
          oauthTokenExpiresAt: null,
          oauthScopes: "",
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
          provider: "manual",
          oauthAccessToken: "",
          oauthRefreshToken: "",
          oauthTokenExpiresAt: null,
          oauthScopes: "",
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
        message: `Verified IMAP and SMTP for ${emailAddress}. Real inbox sync and sending are ready.`,
      })
    } catch (err: any) {
      // IMAP connection failed — wrong password or server issue
      const errorMsg = err?.message || "Unknown error"
      let friendlyError = "Could not connect to your email server."

      if (errorMsg.includes("Authentication") || errorMsg.includes("auth") || errorMsg.includes("password") || errorMsg.includes("credentials")) {
        friendlyError = "The server rejected the app password. For Gmail or Outlook, use the password-free OAuth connection instead."
      } else if (errorMsg.includes("connect") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout")) {
        friendlyError = `Could not reach ${defaults.imapHost}. Check your internet connection or try a different email provider.`
      } else if (errorMsg.includes("ENOTFOUND")) {
        friendlyError = `Email server ${defaults.imapHost} not found. Check if your email address is correct.`
      }

      return NextResponse.json(
        {
          error: friendlyError,
          verified: false,
          ...(process.env.NODE_ENV === "development" ? { detail: errorMsg } : {}),
        },
        { status: 401 }
      )
    }
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
  const accounts = await db.emailAccount.findMany({
    where: { userId: auth.user.id, emailAddress: parsed.data.emailAddress },
  })
  await Promise.all(accounts.map((account) => disconnectOAuthAccount(account)))
  await db.emailAccount.updateMany({
    where: { userId: auth.user.id, emailAddress: parsed.data.emailAddress },
    data: {
      connected: false,
      oauthAccessToken: "",
      oauthRefreshToken: "",
      oauthTokenExpiresAt: null,
      oauthScopes: "",
    },
  })
  return NextResponse.json({ ok: true, message: `Disconnected ${parsed.data.emailAddress}` })
}

function detectProvider(domain: string): {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
} | null {
  const providers: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
    "gmail.com": { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 587 },
    "googlemail.com": { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 587 },
    "outlook.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
    "hotmail.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
    "yahoo.com": { imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 587 },
    "icloud.com": { imapHost: "imap.mail.me.com", imapPort: 993, smtpHost: "smtp.mail.me.com", smtpPort: 587 },
    "live.com": { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  }
  return providers[domain] ?? null
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
  provider: string
  oauthRefreshToken: string
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
    provider: account.provider,
    hasOAuthConnection: Boolean(account.oauthRefreshToken),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    hasImapPassword: Boolean(account.imapPassword),
    hasSmtpPassword: Boolean(account.smtpPassword),
  }
}
