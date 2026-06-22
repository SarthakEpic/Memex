"use client"

import { useEffect } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Brain,
  ScrollText,
  Mail,
  Settings,
  Moon,
  Sun,
  Plus,
  Clock,
  CornerDownLeft,
  BarChart3,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useQuery } from "@tanstack/react-query"
import { useMemex } from "./store"
import type { NoteSummary, DecisionSummary, Section } from "./types"

interface CommandItemDef {
  id: string
  label: string
  hint?: string
  icon: React.ElementType
  group: "navigation" | "actions" | "notes" | "decisions" | "theme"
  action: () => void
  keywords?: string
}

export function CommandPalette() {
  const open = useMemex((s) => s.commandPaletteOpen)
  const setOpen = useMemex((s) => s.setCommandPaletteOpen)
  const { setTheme } = useTheme()
  const setSection = useMemex((s) => s.setSection)
  const openEmail = useMemex((s) => s.openEmailComposer)
  const setActiveSession = useMemex((s) => s.setActiveSession)

  // Cmd+K / Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, setOpen])

  // Load notes + decisions for search (only when open)
  const { data: notesData } = useQuery<{ notes: NoteSummary[] }>({
    queryKey: ["notes"],
    queryFn: async () => {
      const r = await fetch("/api/notes")
      return r.json()
    },
    enabled: open,
  })
  const { data: decisionsData } = useQuery<{ decisions: DecisionSummary[] }>({
    queryKey: ["decisions-all"],
    queryFn: async () => {
      const r = await fetch("/api/decisions")
      return r.json()
    },
    enabled: open,
  })

  const navTo = (s: Section) => {
    setSection(s)
    setOpen(false)
  }

  const navItems: CommandItemDef[] = [
    { id: "nav-dash", label: "Dashboard", hint: "Retrieval health", icon: LayoutDashboard, group: "navigation", action: () => navTo("dashboard"), keywords: "home overview stats" },
    { id: "nav-chat", label: "Chat", hint: "Citation-first Q&A", icon: MessageSquare, group: "navigation", action: () => { setActiveSession(null); navTo("chat") }, keywords: "ask question answer" },
    { id: "nav-notes", label: "Notes", hint: "Markdown ingestion", icon: FileText, group: "navigation", action: () => navTo("notes"), keywords: "documents markdown" },
    { id: "nav-decisions", label: "Decisions", hint: "Extracted rationale", icon: Brain, group: "navigation", action: () => navTo("decisions"), keywords: "why rationale alternatives" },
    { id: "nav-timeline", label: "Timeline", hint: "Chronological view", icon: ScrollText, group: "navigation", action: () => navTo("timeline"), keywords: "history chronological" },
    { id: "nav-analytics", label: "Analytics", hint: "Citation insights", icon: BarChart3, group: "navigation", action: () => navTo("analytics"), keywords: "charts stats insights citations" },
    { id: "nav-email", label: "Email", hint: "Outbox & digests", icon: Mail, group: "navigation", action: () => navTo("email"), keywords: "inbox outbox smtp" },
    { id: "nav-settings", label: "Settings", hint: "Profile & SMTP", icon: Settings, group: "navigation", action: () => navTo("settings"), keywords: "profile smtp config" },
  ]

  const actionItems: CommandItemDef[] = [
    { id: "act-new-chat", label: "Start new chat", icon: Plus, group: "actions", action: () => { setActiveSession(null); navTo("chat") }, keywords: "new chat ask" },
    {
      id: "act-compose",
      label: "Compose email",
      icon: Mail,
      group: "actions",
      action: () => {
        openEmail({ sourceType: "manual" })
        setOpen(false)
      },
      keywords: "send email write",
    },
    {
      id: "act-digest",
      label: "Run daily digest",
      icon: Clock,
      group: "actions",
      action: async () => {
        setOpen(false)
        try {
          const r = await fetch("/api/emails/digest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force: false }),
          })
          const d = await r.json()
          if (d.skipped) {
            window.dispatchEvent(new CustomEvent("memex-toast", { detail: { type: "info", title: "No new activity", desc: "Nothing to digest from the last 24 hours." } }))
          } else {
            window.dispatchEvent(new CustomEvent("memex-toast", { detail: { type: "success", title: "Digest delivered", desc: d.subject } }))
          }
        } catch {
          window.dispatchEvent(new CustomEvent("memex-toast", { detail: { type: "error", title: "Digest failed" } }))
        }
      },
      keywords: "digest daily summary",
    },
  ]

  const themeItems: CommandItemDef[] = [
    { id: "theme-light", label: "Switch to light theme", icon: Sun, group: "theme", action: () => { setTheme("light"); setOpen(false) }, keywords: "light mode bright" },
    { id: "theme-dark", label: "Switch to dark theme", icon: Moon, group: "theme", action: () => { setTheme("dark"); setOpen(false) }, keywords: "dark mode night" },
  ]

  // Add note search results
  const noteItems: CommandItemDef[] = (notesData?.notes ?? []).slice(0, 8).map((n) => ({
    id: `note-${n.id}`,
    label: n.title,
    hint: n.project,
    icon: FileText,
    group: "notes" as const,
    action: () => navTo("notes"),
    keywords: n.tags.join(" "),
  }))

  // Add decision search results
  const decisionItems: CommandItemDef[] = (decisionsData?.decisions ?? []).slice(0, 8).map((d) => ({
    id: `dec-${d.id}`,
    label: d.title,
    hint: d.project,
    icon: Brain,
    group: "decisions" as const,
    action: () => navTo("decisions"),
    keywords: d.rationale.slice(0, 80),
  }))

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search notes, decisions, or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItemWrapper key={item.id} item={item} />
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {actionItems.map((item) => (
            <CommandItemWrapper key={item.id} item={item} />
          ))}
        </CommandGroup>

        <CommandGroup heading="Theme">
          {themeItems.map((item) => (
            <CommandItemWrapper key={item.id} item={item} />
          ))}
        </CommandGroup>

        {noteItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Notes">
              {noteItems.map((item) => (
                <CommandItemWrapper key={item.id} item={item} />
              ))}
            </CommandGroup>
          </>
        )}

        {decisionItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Decisions">
              {decisionItems.map((item) => (
                <CommandItemWrapper key={item.id} item={item} />
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup>
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-2.5 w-2.5" />
              select
            </span>
            <span>↑↓ navigate · esc close</span>
          </div>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function CommandItemWrapper({ item }: { item: CommandItemDef }) {
  const Icon = item.icon
  return (
    <CommandItem
      value={`${item.label} ${item.keywords ?? ""} ${item.hint ?? ""}`}
      onSelect={() => item.action()}
      className="cursor-pointer"
    >
      <Icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
      <span className="flex-1">{item.label}</span>
      {item.hint && (
        <span className="text-[10px] text-muted-foreground">{item.hint}</span>
      )}
    </CommandItem>
  )
}

