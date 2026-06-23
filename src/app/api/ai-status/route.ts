import { NextResponse } from "next/server"
import { getProviderStatus } from "@/lib/ai-client"

// GET /api/ai-status
// Returns the current AI provider configuration status.
// Used by the Settings UI to show which provider is active and whether
// it's properly configured.
export async function GET() {
  const status = getProviderStatus()
  return NextResponse.json(status)
}
