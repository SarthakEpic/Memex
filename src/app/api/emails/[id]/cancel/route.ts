import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// POST /api/emails/[id]/cancel
// Cancel a pending/scheduled/failed email
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const { id } = await params
  const email = await db.email.findFirst({ where: { id, userId: auth.user.id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (email.status === "delivered") {
    return NextResponse.json(
      { error: "Cannot cancel an email that has already been delivered" },
      { status: 400 }
    )
  }

  await db.email.updateMany({
    where: { id, userId: auth.user.id },
    data: { status: "cancelled" },
  })

  return NextResponse.json({ ok: true, status: "cancelled", message: "Email cancelled" })
}
