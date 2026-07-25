import { markdownToHtml } from "@/lib/markdown"

interface SystemEmailInput {
  to: string
  subject: string
  bodyMarkdown: string
}

export function getAppBaseUrl(req?: Request): string {
  const configured = process.env.APP_BASE_URL?.trim()
  if (configured) return configured.replace(/\/$/, "")

  if (req) {
    const proto = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
    if (host) return `${proto}://${host}`
  }

  return "http://localhost:3000"
}

export function isSystemMailerConfigured(): boolean {
  return Boolean(process.env.AUTH_SMTP_HOST && process.env.AUTH_SMTP_USER && process.env.AUTH_SMTP_PASSWORD)
}

export async function sendSystemEmail(input: SystemEmailInput): Promise<{
  sent: boolean
  skippedReason?: string
}> {
  if (!isSystemMailerConfigured()) {
    return { sent: false, skippedReason: "AUTH_SMTP_* is not configured" }
  }

  const nodemailer = await import("nodemailer")
  const port = Number(process.env.AUTH_SMTP_PORT || 587)
  const transporter = nodemailer.createTransport({
    host: process.env.AUTH_SMTP_HOST,
    port,
    secure: process.env.AUTH_SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.AUTH_SMTP_USER,
      pass: process.env.AUTH_SMTP_PASSWORD,
    },
  })

  await transporter.sendMail({
    from: process.env.APP_EMAIL_FROM || process.env.AUTH_SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.bodyMarkdown,
    html: await markdownToHtml(input.bodyMarkdown),
  })

  return { sent: true }
}
