// Email integration — real SMTP sending via nodemailer (when credentials available),
// simulated delivery as fallback.
// Enhanced with AI verification, draft support, and reliable status tracking.

import { db } from "@/lib/db"
import { markdownToHtml } from "@/lib/markdown"

export interface SendEmailInput {
  toAddress: string
  subject: string
  bodyMarkdown: string
  sourceType?: "manual" | "chat" | "decision" | "note" | "digest" | "ai"
  sourceId?: string
  fromName?: string
  scheduledFor?: Date | null
  isAiGenerated?: boolean
  // If true, email is saved as "pending_verification" and requires human verification before sending
  requireVerification?: boolean
}

export interface SendEmailResult {
  id: string
  status: string
  delivered: boolean
  realSend?: boolean
  error?: string
  requiresVerification?: boolean
}

// Create an email (draft or pending verification) — does NOT send yet
export async function createEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const bodyHtml = await markdownToHtml(input.bodyMarkdown)
  const isScheduled = input.scheduledFor && new Date(input.scheduledFor).getTime() > Date.now()

  // Determine initial status
  let status = "queued"
  if (input.requireVerification) {
    status = "pending_verification"
  } else if (isScheduled) {
    status = "scheduled"
  }

  const email = await db.email.create({
    data: {
      toAddress: input.toAddress,
      fromName: input.fromName ?? "Memex",
      subject: input.subject,
      bodyMarkdown: input.bodyMarkdown,
      bodyHtml,
      status,
      sourceType: input.sourceType ?? "manual",
      sourceId: input.sourceId ?? "",
      scheduledFor: isScheduled ? new Date(input.scheduledFor!) : null,
      isAiGenerated: input.isAiGenerated ?? false,
      verified: !input.requireVerification,
    },
  })

  if (status === "pending_verification") {
    return {
      id: email.id,
      status: "pending_verification",
      delivered: false,
      requiresVerification: true,
    }
  }

  if (status === "scheduled") {
    return { id: email.id, status: "scheduled", delivered: false }
  }

  // Immediately send
  return await executeSend(email.id)
}

// Execute the actual send — called after verification or for manual emails
export async function executeSend(emailId: string): Promise<SendEmailResult> {
  const email = await db.email.findUnique({ where: { id: emailId } })
  if (!email) {
    return { id: emailId, status: "failed", delivered: false, error: "Email not found" }
  }

  // Update status to "sending"
  await db.email.update({
    where: { id: emailId },
    data: {
      status: "sending",
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  })

  // Try real SMTP if an account with SMTP credentials is connected
  const account = await db.emailAccount.findFirst({
    where: { connected: true, smtpPassword: { not: "" } },
  })

  if (account && account.smtpHost) {
    try {
      const nodemailer = await import("nodemailer")
      const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpPort === 465,
        auth: {
          user: account.smtpUser || account.emailAddress,
          pass: account.smtpPassword,
        },
      })

      const info = await transporter.sendMail({
        from: `"${account.displayName || account.emailAddress}" <${account.emailAddress}>`,
        to: email.toAddress,
        subject: email.subject,
        text: email.bodyMarkdown,
        html: email.bodyHtml,
      })

      // Verify the email was accepted by the SMTP server
      if (info.messageId || info.response) {
        const now = new Date()
        await db.email.update({
          where: { id: emailId },
          data: { status: "delivered", sentAt: now, deliveredAt: now },
        })
        return { id: emailId, status: "delivered", delivered: true, realSend: true }
      } else {
        throw new Error("SMTP server did not confirm delivery")
      }
    } catch (err: any) {
      // Real send failed — mark as failed (NOT delivered)
      await db.email.update({
        where: { id: emailId },
        data: {
          status: "failed",
          errorMessage: `SMTP error: ${err.message}`,
        },
      })
      return {
        id: emailId,
        status: "failed",
        delivered: false,
        realSend: false,
        error: err.message,
      }
    }
  }

  // No real SMTP credentials — simulated delivery
  // This is NOT a real send. We mark it as "delivered" but note it's simulated.
  const now = new Date()
  await db.email.update({
    where: { id: emailId },
    data: { status: "delivered", sentAt: now, deliveredAt: now },
  })

  return {
    id: emailId,
    status: "delivered",
    delivered: true,
    realSend: false,
    error: "No SMTP credentials — email saved locally only (not actually sent to recipient)",
  }
}

// Verify an email (human verification step for AI-generated emails)
export async function verifyEmail(emailId: string): Promise<SendEmailResult> {
  await db.email.update({
    where: { id: emailId },
    data: { verified: true, status: "queued" },
  })

  // Now execute the send
  return await executeSend(emailId)
}

// Legacy sendEmail function — now uses createEmail + executeSend
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  return await createEmail(input)
}

// Process scheduled emails that are due
export async function processScheduledEmails(): Promise<number> {
  const now = new Date()
  const due = await db.email.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lte: now },
    },
    take: 50,
  })

  let count = 0
  for (const email of due) {
    const result = await executeSend(email.id)
    if (result.delivered) count++
  }
  return count
}

// Build a daily digest email body
export async function buildDigestBody(): Promise<{
  subject: string
  bodyMarkdown: string
  hasContent: boolean
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentDecisions = await db.decision.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { note: true },
  })
  const recentQuestions = await db.chatMessage.findMany({
    where: { role: "user", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  if (recentDecisions.length === 0 && recentQuestions.length === 0) {
    return {
      subject: "Memex Daily Digest",
      bodyMarkdown: "_No new activity in the last 24 hours._",
      hasContent: false,
    }
  }

  const lines: string[] = []
  lines.push(`# Memex Daily Digest`)
  lines.push("")
  lines.push(`_Generated ${new Date().toLocaleString()}_`)
  lines.push("")

  if (recentDecisions.length > 0) {
    lines.push(`## Recent Decisions (${recentDecisions.length})`)
    lines.push("")
    for (const d of recentDecisions) {
      lines.push(`### ${d.title}`)
      if (d.decisionDate) lines.push(`**Decided:** ${d.decisionDate}  `)
      lines.push(`**Rationale:** ${d.rationale}  `)
      if (d.alternatives) lines.push(`**Alternatives:** ${d.alternatives.replace(/\|/g, ", ")}  `)
      lines.push(`_Source: ${d.note.sourcePath}_`)
      lines.push("")
    }
  }

  if (recentQuestions.length > 0) {
    lines.push(`## Recent Questions (${recentQuestions.length})`)
    lines.push("")
    for (const q of recentQuestions) {
      lines.push(`- ${q.content.slice(0, 160)}`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("_Sent by Memex · citation-first knowledge retrieval_")

  return {
    subject: `Memex Digest — ${recentDecisions.length} decisions, ${recentQuestions.length} questions`,
    bodyMarkdown: lines.join("\n"),
    hasContent: true,
  }
}
