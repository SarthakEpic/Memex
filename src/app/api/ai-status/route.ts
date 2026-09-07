import { NextRequest, NextResponse } from "next/server"
import { getProviderStatus } from "@/lib/ai-client"
import { getAIBudgetSnapshot } from "@/server/ai/budget"
import { isAuthFailure, requireUser } from "@/server/auth/guard"

// GET /api/ai-status
// Returns the current AI provider configuration status.
// Used by the Settings UI to show which provider is active and whether
// it's properly configured.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (isAuthFailure(auth)) return auth.response

  const status = getProviderStatus()
  const budget = await getAIBudgetSnapshot(status.provider, status.model, auth.user.id)
  return NextResponse.json({ ...status, budget })
}
