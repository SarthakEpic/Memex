import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/emails/templates — list all templates
export async function GET() {
  const templates = await db.emailTemplate.findMany({
    orderBy: { name: "asc" },
  })
  return NextResponse.json({ templates })
}

// POST /api/emails/templates — create a template
export async function POST(req: NextRequest) {
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
    data: { name, type: type || "custom", subject, bodyMarkdown },
  })
  return NextResponse.json({ template })
}
