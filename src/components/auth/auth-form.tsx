"use client"

import Link from "next/link"
import { useState } from "react"
import { Brain, Loader2, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AuthFormProps {
  mode: "login" | "signup"
}

export function AuthForm({ mode }: AuthFormProps) {
  const isSignup = mode === "signup"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState<{ message: string; href?: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice(null)
    setLoading(true)

    const res = await fetch(`/api/auth/${isSignup ? "register" : "login"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        ...(isSignup ? { name } : {}),
      }),
    }).catch(() => null)

    setLoading(false)

    if (!res) {
      setError("Could not reach the server. Try again.")
      return
    }

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      if (body.requiresEmailVerification) {
        setNotice({
          message: body.error || "Check your email to verify before signing in.",
          href: body.verificationUrl,
        })
        return
      }
      setError(body.error || "Authentication failed.")
      return
    }

    if (body.requiresEmailVerification) {
      setNotice({
        message: "Account created. Check your email to verify before signing in.",
        href: body.verificationUrl,
      })
      return
    }

    window.location.href = "/"
  }

  return (
    <div className="min-h-screen bg-background text-foreground grid lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden lg:flex flex-col justify-between border-r border-border bg-muted/30 p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Memex</div>
            <div className="text-xs text-muted-foreground">private knowledge workspace</div>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">
            Your notes, decisions, inbox, and chat stay isolated to your account.
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Multi-user Memex uses account-scoped data access, protected API routes,
            and encrypted email credentials for safer online deployment.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LockKeyhole className="h-4 w-4" />
          Session cookies are HttpOnly and stored server-side.
        </div>
      </section>

      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Memex</div>
              <div className="text-xs text-muted-foreground">private knowledge workspace</div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              {isSignup ? "Create your workspace" : "Sign in to Memex"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isSignup
                ? "Start with a private account-scoped Memex workspace."
                : "Continue to your private Memex workspace."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}

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

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={isSignup ? 10 : 1}
                required
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                {notice.message}
                {notice.href && (
                  <>
                    {" "}
                    <Link href={notice.href} className="font-medium underline">
                      Open local verification link
                    </Link>
                  </>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "New to Memex?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-primary">
              {isSignup ? "Sign in" : "Create account"}
            </Link>
          </p>

          {!isSignup && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              <Link href="/forgot-password" className="font-medium text-primary">
                Forgot password?
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
