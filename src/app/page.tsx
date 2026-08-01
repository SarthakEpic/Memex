"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Sidebar, MobileNav } from "@/components/memex/sidebar"
import { Dashboard } from "@/components/memex/dashboard"
import { Chat } from "@/components/memex/chat"
import { Notes } from "@/components/memex/notes"
import { Decisions } from "@/components/memex/decisions"
import { Timeline } from "@/components/memex/timeline"
import { Email } from "@/components/memex/email"
import { Inbox_ } from "@/components/memex/inbox"
import { Settings } from "@/components/memex/settings"
import { Analytics } from "@/components/memex/analytics"
import { SourcePanel } from "@/components/memex/source-panel"
import { EmailComposer } from "@/components/memex/email-composer"
import { CommandPalette } from "@/components/memex/command-palette"
import { ShortcutsHelp } from "@/components/memex/shortcuts-help"
import { OnboardingTour } from "@/components/memex/onboarding-tour"
import { useMemex } from "@/components/memex/store"
import { useDevice } from "@/hooks/use-device"
import type { InboxEmailData } from "@/components/memex/types"

export default function Home() {
  const { data: auth, isPending } = useQuery<{
    user: { id: string; email: string; name: string; role: string } | null
  }>({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me")
      const body = await response.json()
      return response.ok ? body : { user: null }
    },
    retry: false,
  })

  useEffect(() => {
    if (!isPending && !auth?.user) {
      window.location.replace("/login")
    }
  }, [auth, isPending])

  if (isPending || !auth?.user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div
          className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-primary"
          role="status"
          aria-label="Checking your session"
        />
      </div>
    )
  }

  return <AuthenticatedHome />
}

function AuthenticatedHome() {
  const section = useMemex((s) => s.section)
  const setSection = useMemex((s) => s.setSection)
  const { isMobile } = useDevice()

  // Listen for cross-component toast events (e.g. from command palette actions)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        type: "info" | "success" | "error"
        title: string
        desc?: string
      }
      if (detail.type === "success") toast.success(detail.title, { description: detail.desc })
      else if (detail.type === "error") toast.error(detail.title, { description: detail.desc })
      else toast.info(detail.title, { description: detail.desc })
    }
    window.addEventListener("memex-toast", handler)
    return () => window.removeEventListener("memex-toast", handler)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get("email_connection")
    if (!result) return

    setSection("inbox")
    if (result === "connected") {
      toast.success("Email account connected", {
        description: "Your inbox can now sync without an app password.",
      })
    } else if (result === "reauthenticate") {
      toast.error("Sign in again to finish connecting your email.")
    } else {
      toast.error("Email account was not connected", {
        description: "No changes were made. Start the connection again from Smart Inbox.",
      })
    }
    url.searchParams.delete("email_connection")
    url.searchParams.delete("section")
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
  }, [setSection])
  // Background scheduled check — runs every 5 minutes to deliver scheduled emails
  // and check for urgent inbox emails
  useEffect(() => {
    const checkScheduled = async () => {
      try {
        await fetch("/api/scheduled-check", { method: "POST" })
      } catch {
        // silent fail — background task
      }
    }
    // Run once on mount
    checkScheduled()
    // Then every 5 minutes
    const interval = setInterval(checkScheduled, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Browser notifications for urgent emails — checks every 2 minutes
  useEffect(() => {
    const notifiedKey = "memex-notified-urgent-emails"
    const checkUrgentEmails = async () => {
      try {
        if (!("Notification" in window) || Notification.permission !== "granted") {
          return
        }

        const response = await fetch("/api/inbox?category=urgent&unread=true")
        if (!response.ok) return

        const data = (await response.json()) as { emails?: InboxEmailData[] }
        const urgent = data.emails ?? []
        if (urgent.length === 0) return

        const notified = new Set<string>(
          JSON.parse(localStorage.getItem(notifiedKey) || "[]")
        )
        const latest = urgent.find((email) => !notified.has(email.id))
        if (!latest) return

        new Notification(`Urgent email from ${latest.fromName || latest.fromAddress}`, {
          body: latest.subject + (latest.summary ? `\n${latest.summary}` : ""),
          icon: "/logo.svg",
          tag: latest.id,
        })
        const nextNotified = [latest.id, ...notified].slice(0, 50)
        localStorage.setItem(notifiedKey, JSON.stringify(nextNotified))
      } catch {
        // Notifications are best-effort and never block the app.
      }
    }

    // Check after 10 seconds (let app load), then every 2 minutes
    const timer = setTimeout(checkUrgentEmails, 10000)
    const interval = setInterval(checkUrgentEmails, 2 * 60 * 1000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav />
        <main className={`flex-1 overflow-hidden ${isMobile ? "pb-14" : ""}`}>
          {section === "dashboard" && (
            <div className="h-full overflow-y-auto thin-scroll">
              <Dashboard />
            </div>
          )}
          {section === "chat" && (
            <div className="h-full overflow-hidden">
              <Chat />
            </div>
          )}
          {section === "notes" && (
            <div className="h-full overflow-hidden">
              <Notes />
            </div>
          )}
          {section === "decisions" && (
            <div className="h-full overflow-hidden">
              <Decisions />
            </div>
          )}
          {section === "timeline" && (
            <div className="h-full overflow-hidden">
              <Timeline />
            </div>
          )}
          {section === "analytics" && (
            <div className="h-full overflow-y-auto thin-scroll">
              <Analytics />
            </div>
          )}
          {section === "email" && (
            <div className="h-full overflow-hidden">
              <Email />
            </div>
          )}
          {section === "inbox" && (
            <div className="h-full overflow-hidden">
              <Inbox_ />
            </div>
          )}
          {section === "settings" && (
            <div className="h-full overflow-y-auto thin-scroll">
              <Settings />
            </div>
          )}
        </main>
      </div>

      {/* Global overlays */}
      <SourcePanel />
      <EmailComposer />
      <CommandPalette />
      <ShortcutsHelp />
      <OnboardingTour />
    </div>
  )
}
