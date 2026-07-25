"use client"

import Link from "next/link"
import { useState } from "react"
import { Brain, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Memex</div>
            <div className="text-xs text-muted-foreground">account recovery</div>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {children}
      </div>
    </main>
  )
}

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [localUrl, setLocalUrl] = useState("")
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage("")
    setLocalUrl("")
    setError("")

    const res = await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null)

    setLoading(false)
    if (!res) {
      setError("Could not reach the server.")
      return
    }

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error || "Could not request a password reset.")
      return
    }

    setMessage(body.message || "If an account exists, a reset link has been sent.")
    if (body.resetUrl) setLocalUrl(body.resetUrl)
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email. If it exists, Memex will send a reset link."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {message}
            {localUrl && (
              <>
                {" "}
                <Link href={localUrl} className="font-medium underline">
                  Open local reset link
                </Link>
              </>
            )}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}

export function PasswordResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null)

    setLoading(false)
    if (!res) {
      setError("Could not reach the server.")
      return
    }

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error || "Could not reset your password.")
      return
    }

    setDone(true)
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use at least 10 characters. Existing sessions will be signed out."
    >
      {!token ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Missing reset token. Request a new password reset link.
        </div>
      ) : done ? (
        <div className="space-y-4">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300 flex gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Password updated. You can sign in with the new password.
          </div>
          <Button asChild className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
