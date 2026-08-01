import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { decryptSecret } from "@/server/security/encryption"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { isEmailOAuthProvider, oauthProviderFetch } from "@/server/email/oauth"

// POST /api/inbox/[id]/delete-from-provider
// Explicitly deletes the provider message, then removes the local Memex copy.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const email = await db.inboxEmail.findFirst({ where: { id, userId: auth.user.id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const account = email.accountId
    ? await db.emailAccount.findFirst({
        where: { id: email.accountId, userId: auth.user.id, connected: true },
      })
    : await db.emailAccount.findFirst({
        where: { userId: auth.user.id, connected: true },
        orderBy: { updatedAt: "desc" },
      })

  if (!account) {
    return NextResponse.json({ error: "This email no longer has a connected provider account." }, { status: 400 })
  }

  try {
    if (account.syncMode === "oauth" && isEmailOAuthProvider(account.provider)) {
      if (!email.providerMessageId) {
        return NextResponse.json(
          { error: "This older synced email has no provider identifier. Sync again before deleting it from the provider." },
          { status: 409 }
        )
      }
      const providerUrl =
        account.provider === "google"
          ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(email.providerMessageId)}`
          : `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(email.providerMessageId)}`
      const response = await oauthProviderFetch(account, providerUrl, { method: "DELETE" })
      if (!response.ok) {
        const message = response.status === 401 || response.status === 403
          ? "Provider access expired or was revoked. Reconnect the account."
          : "The provider could not delete this email. Try again shortly."
        return NextResponse.json({ error: message }, { status: 502 })
      }
    } else if (account.syncMode === "real" && account.imapPassword) {
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
          const searchResult = await client.search({ from: email.fromAddress, subject: email.subject })
          const messageIds = Array.isArray(searchResult) ? searchResult : []
          if (messageIds.length === 0) {
            return NextResponse.json({
              ok: false,
              message: "Email was not found in the provider inbox. It may already be moved or deleted.",
            })
          }
          for (const messageId of messageIds) await client.messageDelete(messageId)
          await client.mailboxClose()
        } finally {
          lock.release()
        }
      } finally {
        await client.logout()
      }
    } else {
      return NextResponse.json(
        { error: "This account needs to be reconnected before provider deletion is available." },
        { status: 400 }
      )
    }

    await db.inboxEmail.deleteMany({ where: { id, userId: auth.user.id } })
    return NextResponse.json({ ok: true, message: "Email deleted from your provider and removed from Memex." })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider deletion failed."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}