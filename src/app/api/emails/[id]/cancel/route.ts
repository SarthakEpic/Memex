import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/emails/[id]/cancel
// Cancel a pending/scheduled/failed email
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const email = await db.email.findUnique({ where: { id } })
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (email.status === "delivered") {
    return NextResponse.json(
      { error: "Cannot cancel an email that has already been delivered" },
      { status: 400 }
    )
  }

  await db.email.update({
    where: { id },
    data: { status: "cancelled" },
  })

  return NextResponse.json({ ok: true, status: "cancelled", message: "Email cancelled" })
}
