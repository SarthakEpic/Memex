import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"
import { validationError } from "@/server/validation/api"
import { emailTemplateCreateSchema } from "@/server/validation/mutations"

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
  const parsed = emailTemplateCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 })
  }
  const { name, type, subject, bodyMarkdown } = parsed.data
  const template = await db.emailTemplate.create({
    data: { userId: auth.user.id, name, type, subject, bodyMarkdown },
  })
  return NextResponse.json({ template })
}
