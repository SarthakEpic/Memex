import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { decryptSecret } from "@/server/security/encryption"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// POST /api/inbox/[id]/delete-from-provider
// Deletes the email from the real email provider (Gmail/Outlook) via IMAP.
// This is a SEPARATE action from deleting from the app's local database.
// Requires explicit user confirmation.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const email = await db.inboxEmail.findFirst({
    where: { id, userId: auth.user.id },
  })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Find the connected account
  const account = await db.emailAccount.findFirst({
    where: { userId: auth.user.id, connected: true, syncMode: "real" },
  })

  if (!account || !account.imapPassword) {
    return NextResponse.json(
      { error: "No real IMAP account connected. Connect an email account with IMAP credentials to delete from the provider." },
      { status: 400 }
    )
  }

  try {
    const { ImapFlow } = await import("imapflow")
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: {
        user: account.imapUser || account.emailAddress,
        pass: decryptSecret(account.imapPassword),
      },
      logger: false,
    })

    await client.connect()

    try {
      const lock = await client.getMailboxLock("INBOX")
      try {
        // Search for the email by subject and sender
        const searchResult = await client.search({
          from: email.fromAddress,
          subject: email.subject,
        })
        const messageIds = Array.isArray(searchResult) ? searchResult : []

        if (messageIds.length === 0) {
          return NextResponse.json({
            ok: false,
            message: "Email not found in your provider's inbox. It may have been moved or deleted already.",
          })
        }

        // Mark as deleted and expunge
        for (const msgId of messageIds) {
          await client.messageDelete(msgId)
        }
        await client.mailboxClose()
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }

    // Also remove from local database
    await db.inboxEmail.deleteMany({ where: { id, userId: auth.user.id } })

    return NextResponse.json({
      ok: true,
      message: "Email deleted from your email provider and removed from Memex.",
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to delete from provider: ${err.message}` },
      { status: 500 }
    )
  }
}
