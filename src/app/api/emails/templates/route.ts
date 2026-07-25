import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// GET /api/emails/templates — list all templates
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const templates = await db.emailTemplate.findMany({
    where: { userId: auth.user.id },
    orderBy: { name: "asc" },
  })
  return NextResponse.json({ templates })
}

// POST /api/emails/templates — create a template
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const body = await req.json().catch(() => ({}))
  const { name, type, subject, bodyMarkdown } = body as {
    name?: string
    type?: string
    subject?: string
    bodyMarkdown?: string
  }
  if (!name || !subject || !bodyMarkdown) {
    return NextResponse.json({ error: "name, subject, bodyMarkdown required" }, { status: 400 })
  }
  const template = await db.emailTemplate.create({
    data: { userId: auth.user.id, name, type: type || "custom", subject, bodyMarkdown },
  })
  return NextResponse.json({ template })
}
