"use client"

import { useEffect } from "react"
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

export default function Home() {
  const section = useMemex((s) => s.section)
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

  // Background scheduled check — runs every 5 minutes to deliver scheduled emails
  // and check for urgent inbox emails
  useEffect(() => {
    const checkScheduled = async () => {
      try {
        await fetch("/api/scheduled-check")
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
    const lastNotifiedKey = "memex-last-notified-email"
    const checkUrgentEmails = async () => {
      try {
        const r = await fetch("/api/inbox?category=urgent&unread=true")
        const d = await r.json()
        const urgent = d.emails || []
        if (urgent.length === 0) return

        // Get last notified email ID
        const lastNotified = localStorage.getItem(lastNotifiedKey) || ""

        // Find new urgent emails we haven't notified about
        const newUrgent = urgent.filter((e: any) => e.id !== lastNotified)
        if (newUrgent.length === 0) return

        // Request notification permission if not granted
        if ("Notification" in window && Notification.permission === "granted") {
          const latest = newUrgent[0]
          new Notification("🚨 Urgent Email — " + (latest.fromName || latest.fromAddress), {
            body: latest.subject + (latest.summary ? "\n" + latest.summary : ""),
            icon: "/logo.svg",
            tag: latest.id,
          })
          localStorage.setItem(lastNotifiedKey, latest.id)
        }
      } catch {
        // silent fail
      }
    }

    // Request permission on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
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
