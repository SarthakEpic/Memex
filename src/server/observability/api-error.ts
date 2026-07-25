import { NextResponse } from "next/server"
import { logError } from "./logger"

export function errorId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function serverError(error: unknown, context: Record<string, unknown>): NextResponse {
  const id = errorId()
  logError("api.error", {
    errorId: id,
    ...context,
    error: serializeError(error),
  })

  return NextResponse.json(
    {
      error: "Something went wrong. Please try again.",
      errorId: id,
    },
    { status: 500 }
  )
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    }
  }

  return { message: String(error) }
}
