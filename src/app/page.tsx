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
import { useMemex } from "@/components/memex/store"

export default function Home() {
  const section = useMemex((s) => s.section)

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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav />
        <main className="flex-1 overflow-hidden">
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
    </div>
  )
}
