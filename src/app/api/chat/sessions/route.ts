import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/chat/sessions — list all chat sessions
export async function GET() {
  const sessions = await db.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  })
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      messageCount: s._count.messages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      preview: s.messages[0]?.content.slice(0, 80) ?? "",
    })),
  })
}
