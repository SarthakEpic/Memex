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
import { Settings } from "@/components/memex/settings"
import { SourcePanel } from "@/components/memex/source-panel"
import { EmailComposer } from "@/components/memex/email-composer"
import { CommandPalette } from "@/components/memex/command-palette"
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
          {section === "chat" && <Chat />}
          {section === "notes" && <Notes />}
          {section === "decisions" && <Decisions />}
          {section === "timeline" && <Timeline />}
          {section === "email" && <Email />}
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
    </div>
  )
}
