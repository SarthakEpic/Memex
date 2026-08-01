import { afterEach, describe, expect, it } from "vitest"
import {
  createEmailOAuthStart,
  getOAuthProviderAvailability,
  validateEmailOAuthState,
} from "./oauth"

const originalGoogleId = process.env.GOOGLE_OAUTH_CLIENT_ID
const originalGoogleSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET

afterEach(() => {
  if (originalGoogleId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID
  else process.env.GOOGLE_OAUTH_CLIENT_ID = originalGoogleId
  if (originalGoogleSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
  else process.env.GOOGLE_OAUTH_CLIENT_SECRET = originalGoogleSecret
})

describe("email OAuth state", () => {
  it("creates a PKCE authorization request and validates its signed callback state", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-google-client"
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-secret"

    const flow = createEmailOAuthStart({
      provider: "google",
      userId: "user-123",
      requestUrl: "http://localhost:3000/api/email-accounts/oauth/google",
    })
    const url = new URL(flow.authorizationUrl)
    const state = url.searchParams.get("state")

    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(state).toBeTruthy()
    expect(
      validateEmailOAuthState({
        stateCookie: flow.stateCookie,
        receivedState: state,
        userId: "user-123",
        provider: "google",
      }).codeVerifier
    ).toHaveLength(64)
  })

  it("rejects a callback state from another user or provider", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-google-client"
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-secret"
    const flow = createEmailOAuthStart({
      provider: "google",
      userId: "user-123",
      requestUrl: "http://localhost:3000/api/email-accounts/oauth/google",
    })
    const state = new URL(flow.authorizationUrl).searchParams.get("state")

    expect(() =>
      validateEmailOAuthState({
        stateCookie: flow.stateCookie,
        receivedState: state,
        userId: "another-user",
        provider: "google",
      })
    ).toThrow(/could not be verified/i)
  })

  it("reports OAuth availability without exposing provider secrets", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    expect(getOAuthProviderAvailability().google).toBe(false)
  })
})
