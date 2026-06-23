"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  GitBranch,
  Mail,
  Settings,
  Brain,
  ScrollText,
  Command,
  Search,
  BarChart3,
  Inbox,
  Shield,
  Send,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMemex } from "./store"
import { ThemeToggle } from "./theme-toggle"
import type { Section, StatsData, EmailAccountData } from "./types"

// Top-level nav (non-email sections)
const TOP_NAV: { id: Section; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Retrieval health" },
  { id: "chat", label: "Chat", icon: MessageSquare, desc: "Smart assistant" },
  { id: "notes", label: "Notes", icon: FileText, desc: "Markdown ingestion" },
  { id: "decisions", label: "Decisions", icon: Brain, desc: "Extracted rationale" },
  { id: "timeline", label: "Timeline", icon: ScrollText, desc: "Chronological view" },
  { id: "analytics", label: "Analytics", icon: BarChart3, desc: "Citation insights" },
]

// Email sub-sections (under "Email" parent)
const EMAIL_NAV: { id: Section; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "inbox", label: "Smart Inbox", icon: Inbox, desc: "AI email management" },
  { id: "email", label: "Sent", icon: Send, desc: "Sent emails & digests" },
]

export function Sidebar() {
  const section = useMemex((s) => s.section)
  const setSection = useMemex((s) => s.setSection)
  const openEmail = useMemex((s) => s.openEmailComposer)
  const openCommandPalette = useMemex((s) => s.openCommandPalette)
  const [emailExpanded, setEmailExpanded] = useState(true) // Email section expanded by default

  const { data: stats } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats")
      return r.json()
    },
  })

  const emailBadge = stats?.counts.emails ?? 0

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar/50 backdrop-blur-sm">
      {/* Brand */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
            <span className="text-sm tracking-tighter">M</span>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary border border-background" />
            </span>
          </div>
          <div className="leading-tight flex-1">
            <div className="font-semibold text-sm tracking-tight">Memex</div>
            <div className="text-[10px] text-muted-foreground">
              citation-first retrieval
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Search trigger */}
      <div className="p-2 border-b border-border">
        <button
          onClick={() => openCommandPalette()}
          className="w-full flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:border-border/80 transition-colors group"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 text-[9px] font-mono font-medium">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto thin-scroll p-2 space-y-0.5">
        {/* Top-level sections */}
        {TOP_NAV.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "w-full group flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  active ? "text-primary" : "group-hover:text-foreground"
                )}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{item.label}</span>
                <div className="text-[10px] text-muted-foreground truncate">
                  {item.desc}
                </div>
              </div>
            </button>
          )
        })}

        {/* Email section — collapsible parent */}
        <div className="pt-1">
          <button
            onClick={() => setEmailExpanded(!emailExpanded)}
            className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            {emailExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <Mail className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Email</span>
            {emailBadge > 0 && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-auto">
                {emailBadge}
              </Badge>
            )}
          </button>

          {emailExpanded && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
              {EMAIL_NAV.map((item) => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "w-full group flex items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 mt-0.5 shrink-0",
                        active ? "text-primary" : "group-hover:text-foreground"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{item.label}</span>
                      <div className="text-[9px] text-muted-foreground truncate">
                        {item.desc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Settings */}
        <button
          onClick={() => setSection("settings")}
          className={cn(
            "w-full group flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
            section === "settings"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          )}
        >
          <Settings
            className={cn(
              "h-4 w-4 mt-0.5 shrink-0",
              section === "settings" ? "text-primary" : "group-hover:text-foreground"
            )}
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">Settings</span>
            <div className="text-[10px] text-muted-foreground truncate">
              Profile & security
            </div>
          </div>
        </button>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => openEmail({ sourceType: "manual" as const })}
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" />
          Compose email
        </Button>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
          {stats ? (
            <span>
              {stats.counts.notes} notes · {stats.corpus.chunkCount} chunks ·{" "}
              {stats.counts.decisions} decisions
            </span>
          ) : (
            <span>Loading…</span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <Shield className="h-3 w-3 text-emerald-500" title="Data encrypted locally" />
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}
              className="inline-flex items-center justify-center h-5 w-5 rounded border border-border bg-muted hover:bg-accent transition-colors font-mono font-medium"
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

// Mobile top nav (visible on small screens)
export function MobileNav() {
  const section = useMemex((s) => s.section)
  const setSection = useMemex((s) => s.setSection)
  const ALL_NAV = [...TOP_NAV, ...EMAIL_NAV, { id: "settings" as Section, label: "Settings", icon: Settings, desc: "Profile & security" }]
  return (
    <div className="md:hidden border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto thin-scroll">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs shrink-0">
          M
        </div>
        {ALL_NAV.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shrink-0 transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
