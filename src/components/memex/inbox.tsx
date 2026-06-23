"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Inbox,
  Mail,
  MailOpen,
  Star,
  Archive,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  Newspaper,
  Ban,
  Reply,
  Sparkles,
  Plus,
  Wifi,
  WifiOff,
  Shield,
  Zap,
  FileText,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { useMemex } from "./store"
import { useDevice } from "@/hooks/use-device"
import type { InboxEmailData, EmailAccountData } from "./types"

const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  urgent: { icon: Zap, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border-red-500/30", label: "Urgent" },
  important: { icon: AlertCircle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", label: "Important" },
  normal: { icon: Mail, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", label: "Normal" },
  newsletter: { icon: Newspaper, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", label: "Newsletter" },
  spam: { icon: Ban, color: "text-muted-foreground", bg: "bg-muted border-border", label: "Spam" },
}

type InboxTab = "all" | "urgent" | "important" | "normal" | "newsletter" | "unread"

export function Inbox_() {
  const [tab, setTab] = useState<InboxTab>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { isMobile } = useDevice()
  const [syncing, setSyncing] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [briefingOpen, setBriefingOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [threaded, setThreaded] = useState(false)
  const qc = useQueryClient()

  const params = new URLSearchParams()
  if (tab === "urgent") params.set("category", "urgent")
  if (tab === "important") params.set("category", "important")
  if (tab === "normal") params.set("category", "normal")
  if (tab === "newsletter") params.set("category", "newsletter")
  if (tab === "unread") params.set("unread", "true")
  if (search) params.set("q", search)
  if (threaded) params.set("threaded", "true")

  const { data: inboxData, isLoading } = useQuery<{ emails: InboxEmailData[]; threads?: any[] }>({
    queryKey: ["inbox", tab, search, threaded],
    queryFn: async () => {
      const r = await fetch(`/api/inbox?${params.toString()}`)
      return r.json()
    },
  })

  const { data: accountsData } = useQuery<{ accounts: EmailAccountData[] }>({
    queryKey: ["email-accounts"],
    queryFn: async () => {
      const r = await fetch("/api/email-accounts")
      return r.json()
    },
  })

  const accounts = accountsData?.accounts ?? []
  const connectedAccounts = accounts.filter((a) => a.connected)
  const emails = inboxData?.emails ?? []
  // Check if any account is in real mode (not demo)
  const hasRealAccount = connectedAccounts.some((a) => (a as any).syncMode === "real")
  const isDemoMode = connectedAccounts.length > 0 && !hasRealAccount

  const handleSync = async () => {
    if (connectedAccounts.length === 0) {
      setConnectOpen(true)
      return
    }
    setSyncing(true)
    try {
      const r = await fetch("/api/inbox/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      })
      const d = await r.json()
      if (d.added > 0) {
        toast.success(d.message)
      } else {
        toast.info("No new emails found.")
      }
      qc.invalidateQueries({ queryKey: ["inbox"] })
    } catch {
      toast.error("Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* List — hidden entirely when no emails and no account (empty state takes full width) */}
      <div className={`${(emails.length === 0 && connectedAccounts.length === 0) ? "hidden" : selectedId && isMobile ? "hidden" : "flex"} w-full lg:w-96 shrink-0 flex-col border-r border-border`}>
        {/* Header — clean, well-spaced */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Inbox className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Smart Inbox</h2>
                  {isDemoMode && (
                    <Badge className="text-[9px] gap-0.5 bg-amber-500 hover:bg-amber-500" title="Demo mode — sample emails">
                      <Sparkles className="h-2.5 w-2.5" />
                      Demo
                    </Badge>
                  )}
                  {hasRealAccount && (
                    <Badge className="text-[9px] gap-0.5 bg-emerald-600 hover:bg-emerald-600" title="Real IMAP connected">
                      <Wifi className="h-2.5 w-2.5" />
                      Live
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {connectedAccounts.length > 0
                    ? `${connectedAccounts.length} account${connectedAccounts.length !== 1 ? "s" : ""} connected · AI-analyzed`
                    : "No account connected"}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              {connectedAccounts.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setManageOpen(true)}
                  title="Manage connected accounts"
                >
                  <Wifi className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setConnectOpen(true)}
                title="Connect email account"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setBriefingOpen(true)}
                title="Daily AI email briefing"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                Sync
              </Button>
            </div>
          </div>

          {/* Category tabs + search + threads — compact row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 text-[11px] flex-1 min-w-0 overflow-x-auto thin-scroll">
              {(["all", "urgent", "important", "unread", "newsletter"] as InboxTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-2.5 py-1 rounded-md font-medium capitalize shrink-0 transition-colors ${
                    tab === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Search + Thread toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inbox..."
                className="w-full text-xs pl-8 pr-3 h-8 rounded-md border border-border bg-muted/30 outline-none focus:border-primary/40 focus:bg-background transition-colors"
              />
            </div>
            <button
              onClick={() => setThreaded(!threaded)}
              className={`flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md border transition-colors shrink-0 ${
                threaded
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              title="Group emails by conversation"
            >
              <Mail className="h-3 w-3" />
              Threads
            </button>
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full thin-scroll">
          <div className="p-2 space-y-1">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && emails.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium">Inbox is empty</p>
                <p className="text-xs text-muted-foreground">
                  {connectedAccounts.length > 0
                    ? "Click Sync to fetch new emails with AI analysis."
                    : "Connect an email account to get started."}
                </p>
              </div>
            )}
            {emails.map((e) => (
              <InboxListItem
                key={e.id}
                email={e}
                active={selectedId === e.id}
                onClick={() => setSelectedId(e.id)}
              />
            ))}
          </div>
          </ScrollArea>
        </div>
      </div>

      {/* Detail / Empty state — full width when list is hidden */}
      <div className={`${selectedId ? "flex" : (emails.length === 0 && connectedAccounts.length === 0) ? "flex" : isMobile ? "hidden" : "flex"} flex-1 min-w-0`}>
        {selectedId ? (
          <div className="w-full">
            <button
              onClick={() => setSelectedId(null)}
              className={`${isMobile ? "flex" : "hidden"} items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground border-b border-border`}
            >
              ← Back to inbox
            </button>
            <InboxDetailPanel id={selectedId} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-2 max-w-md">
              <h3 className="text-base font-semibold">Connect Your Email to Get Started</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Memex reads, categorizes, and prioritizes your emails with AI.
                Get a daily briefing, AI summaries, and smart reply drafts.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setConnectOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Connect Email
              </Button>
              {connectedAccounts.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Sync Now
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <ConnectAccountDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <ManageAccountsDialog open={manageOpen} onOpenChange={setManageOpen} />
      <BriefingDialog open={briefingOpen} onOpenChange={setBriefingOpen} />
    </div>
  )
}

function InboxListItem({
  email,
  active,
  onClick,
}: {
  email: InboxEmailData
  active: boolean
  onClick: () => void
}) {
  const cat = CATEGORY_CONFIG[email.category] ?? CATEGORY_CONFIG.normal
  const CatIcon = cat.icon
  const qc = useQueryClient()

  const handleStar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/inbox/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isStarred: !email.isStarred }),
    })
    qc.invalidateQueries({ queryKey: ["inbox"] })
  }

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/inbox/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true }),
    })
    toast.success("Email archived")
    qc.invalidateQueries({ queryKey: ["inbox"] })
  }

  return (
    <div
      className={`group rounded-lg p-3 cursor-pointer transition-all relative overflow-hidden ${
        active ? "bg-accent ring-1 ring-primary/20" : "hover:bg-accent/50"
      } ${!email.isRead ? "border-l-2 border-l-primary" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        {/* Category icon */}
        <div className={`shrink-0 rounded p-1 border ${cat.bg}`}>
          <CatIcon className={`h-3 w-3 ${cat.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className={`text-xs truncate ${!email.isRead ? "font-bold" : "font-medium"}`}>
              {email.fromName || email.fromAddress}
            </span>
            <span className="text-[9px] text-muted-foreground shrink-0">
              {new Date(email.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className={`text-xs truncate mt-0.5 ${!email.isRead ? "font-semibold" : ""}`}>
            {email.subject}
          </div>
          {email.summary && (
            <div className="text-[10px] text-muted-foreground truncate mt-0.5 italic">
              {email.summary}
            </div>
          )}
          <div className="flex items-center gap-1 mt-1">
            <Badge variant="outline" className={`text-[9px] h-4 ${cat.bg} ${cat.color} border-0`}>
              {cat.label}
            </Badge>
            {email.action === "reply_needed" && (
              <Badge className="text-[9px] h-4 bg-red-600 hover:bg-red-600 gap-0.5">
                <Reply className="h-2 w-2" />
                Reply
              </Badge>
            )}
            {!email.isRead && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={handleStar}
            className={`p-0.5 rounded hover:bg-accent transition-colors ${
              email.isStarred ? "text-amber-500" : "text-muted-foreground opacity-0 group-hover:opacity-100"
            }`}
          >
            <Star className={`h-3 w-3 ${email.isStarred ? "fill-amber-500" : ""}`} />
          </button>
          <button
            onClick={handleArchive}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Archive className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

function InboxDetailPanel({ id }: { id: string }) {
  const qc = useQueryClient()
  const openEmail = useMemex((s) => s.openEmailComposer)
  const [replyOpen, setReplyOpen] = useState(false)
  const [drafting, setDrafting] = useState(false)

  const { data, isLoading } = useQuery<{ email: InboxEmailData }>({
    queryKey: ["inbox-email", id],
    queryFn: async () => {
      const r = await fetch(`/api/inbox/${id}`)
      return r.json()
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const e = data.email
  const cat = CATEGORY_CONFIG[e.category] ?? CATEGORY_CONFIG.normal
  const CatIcon = cat.icon

  const handleDelete = async () => {
    // Only deletes from the app's local database — does NOT touch the original email in Gmail/Outlook
    await fetch(`/api/inbox/${id}`, { method: "DELETE" })
    toast.success("Email removed from Memex", {
      description: "The original email is still in your email provider.",
    })
    qc.invalidateQueries({ queryKey: ["inbox"] })
  }

  const handleDeleteFromProvider = async () => {
    const confirmed = window.confirm(
      "This will PERMANENTLY DELETE the email from your email provider (Gmail/Outlook).\n\n" +
      "This cannot be undone. The email will also be removed from Memex.\n\n" +
      "Are you sure?"
    )
    if (!confirmed) return

    try {
      const r = await fetch(`/api/inbox/${id}/delete-from-provider`, { method: "POST" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || d.message)
      toast.success(d.message || "Email deleted from provider")
      qc.invalidateQueries({ queryKey: ["inbox"] })
    } catch (e: any) {
      toast.error(e.message || "Failed to delete from provider")
    }
  }

  const handleStar = async () => {
    await fetch(`/api/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isStarred: !e.isStarred }),
    })
    qc.invalidateQueries({ queryKey: ["inbox"] })
    qc.invalidateQueries({ queryKey: ["inbox-email", id] })
  }

  return (
    <ScrollArea className="h-full thin-scroll">
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl memex-fade-up">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={`rounded p-1 border ${cat.bg}`}>
                  <CatIcon className={`h-3.5 w-3.5 ${cat.color}`} />
                </div>
                <Badge variant="outline" className={`text-[10px] ${cat.bg} ${cat.color} border-0`}>
                  {cat.label}
                </Badge>
                {e.action === "reply_needed" && (
                  <Badge className="text-[10px] bg-red-600 hover:bg-red-600">
                    <Reply className="h-2.5 w-2.5 mr-0.5" />
                    Reply needed
                  </Badge>
                )}
              </div>
              <h1 className="text-lg font-semibold leading-tight">{e.subject}</h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{e.fromName || e.fromAddress}</span>
                <span>·</span>
                <span className="font-mono">{e.fromAddress}</span>
                <span>·</span>
                <span>{new Date(e.receivedAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleStar}>
                <Star className={`h-3.5 w-3.5 ${e.isStarred ? "fill-amber-500 text-amber-500" : ""}`} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() =>
                  openEmail({
                    subject: `Re: ${e.subject}`,
                    bodyMarkdown: `Replying to ${e.fromAddress}:\n\n---\n\n`,
                    sourceType: "manual",
                  })
                }
              >
                <Mail className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={async () => {
                  try {
                    const r = await fetch(`/api/inbox/${id}/to-note`, { method: "POST" })
                    const d = await r.json()
                    if (!r.ok) throw new Error(d.error)
                    toast.success(d.message || "Email converted to note")
                    window.dispatchEvent(new CustomEvent("memex-notes-updated"))
                  } catch (e: any) {
                    toast.error(e.message || "Conversion failed")
                  }
                }}
                title="Convert email to note"
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleDelete} title="Remove from Memex (keeps original in email provider)">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={handleDeleteFromProvider} title="Permanently delete from email provider (Gmail/Outlook)">
                <AlertCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* AI Summary */}
        {e.analyzed && e.summary && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-primary font-medium">
                    AI Summary
                  </div>
                  <p className="text-sm leading-relaxed">{e.summary}</p>
                  {e.keyPoints.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                        Key Points
                      </div>
                      <ul className="space-y-0.5">
                        {e.keyPoints.map((kp, i) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <span className="text-primary shrink-0">•</span>
                            <span>{kp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Email body */}
        <Card>
          <CardContent className="p-4">
            <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
              {e.body}
            </pre>
          </CardContent>
        </Card>

        {/* AI Suggested Reply */}
        {e.suggestedReply && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  AI Suggested Reply
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() =>
                    openEmail({
                      subject: `Re: ${e.subject}`,
                      bodyMarkdown: e.suggestedReply,
                      sourceType: "manual",
                    })
                  }
                >
                  Use draft
                </Button>
              </div>
              <pre className="text-xs whitespace-pre-wrap leading-relaxed font-sans text-foreground/80">
                {e.suggestedReply}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* AI Reply Generator */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                <Reply className="h-3 w-3" />
                Generate AI Reply
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px]"
                onClick={() => setReplyOpen(!replyOpen)}
              >
                {replyOpen ? "Cancel" : "Open"}
              </Button>
            </div>
            {replyOpen && (
              <ReplyGenerator
                emailId={id}
                onDrafted={(draft) => {
                  openEmail({
                    subject: `Re: ${e.subject}`,
                    bodyMarkdown: draft,
                    sourceType: "manual",
                  })
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}

function ReplyGenerator({
  emailId,
  onDrafted,
}: {
  emailId: string
  onDrafted: (draft: string) => void
}) {
  const [instruction, setInstruction] = useState("")
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    if (!instruction.trim()) return
    setLoading(true)
    try {
      const r = await fetch(`/api/inbox/${emailId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      })
      const d = await r.json()
      setDraft(d.draft)
    } catch {
      toast.error("Failed to generate draft")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="e.g. Accept the proposal and suggest Tuesday at 2pm"
        className="text-xs h-8"
      />
      <Button size="sm" className="h-7 text-xs" onClick={generate} disabled={loading || !instruction.trim()}>
        {loading ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3 mr-1" />
        )}
        Generate draft
      </Button>
      {draft && (
        <div className="rounded-md border border-border p-2.5 bg-muted/30 space-y-2">
          <pre className="text-xs whitespace-pre-wrap leading-relaxed font-sans">{draft}</pre>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px]"
            onClick={() => onDrafted(draft)}
          >
            <Mail className="h-3 w-3 mr-1" />
            Use this draft
          </Button>
        </div>
      )}
    </div>
  )
}

function ManageAccountsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ accounts: EmailAccountData[] }>({
    queryKey: ["email-accounts"],
    queryFn: async () => {
      const r = await fetch("/api/email-accounts")
      return r.json()
    },
    enabled: open,
  })

  const accounts = (data?.accounts ?? []).filter((a) => a.connected)

  const handleDisconnect = async (emailAddress: string) => {
    await fetch("/api/email-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailAddress }),
    })
    toast.success(`Disconnected ${emailAddress}`)
    qc.invalidateQueries({ queryKey: ["email-accounts"] })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            Connected Email Accounts
          </DialogTitle>
          <DialogDescription>
            Accounts you&apos;ve connected for inbox management.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && accounts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No accounts connected yet.
            </p>
          )}
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border p-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.displayName}</div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {a.emailAddress}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  IMAP: {a.imapHost}:{a.imapPort} · SMTP: {a.smtpHost}:{a.smtpPort}
                </div>
                {a.lastSyncAt && (
                  <div className="text-[10px] text-muted-foreground">
                    Last sync: {new Date(a.lastSyncAt).toLocaleString()}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                onClick={() => handleDisconnect(a.emailAddress)}
              >
                <WifiOff className="h-3.5 w-3.5 mr-1" />
                Disconnect
              </Button>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Demo Mode:</strong> Inbox sync generates
            simulated sample emails to showcase the AI categorization features.
            Real IMAP connection will be added in a future update.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConnectAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [emailAddress, setEmailAddress] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [imapPassword, setImapPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState("")

  const handleConnect = async () => {
    if (!emailAddress.trim()) {
      setError("Email address is required")
      return
    }
    setError("")
    setConnecting(true)
    setVerifying(!!imapPassword.trim()) // Show "verifying" if password provided

    try {
      const r = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAddress: emailAddress.trim(),
          displayName: displayName.trim() || undefined,
          imapPassword: imapPassword.trim() || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error || d.detail || "Connection failed")
        setVerifying(false)
        return
      }
      toast.success(d.message || "Account connected", {
        description: d.verified ? "IMAP verified ✓" : "Demo mode",
      })
      setEmailAddress("")
      setDisplayName("")
      setImapPassword("")
      setError("")
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ["email-accounts"] })
    } catch (e: any) {
      setError(e.message || "Connection failed")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            Connect Email Account
          </DialogTitle>
          <DialogDescription>
            Connect your email to let Memex read, categorize, and prioritize
            your inbox. IMAP/SMTP settings are auto-detected for common providers
            (Gmail, Outlook, Yahoo, iCloud).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Email address</Label>
            <Input
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="you@gmail.com"
              className="text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Display name (optional)</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="John Doe"
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              IMAP app password{" "}
              <span className="text-muted-foreground">
                (for real inbox sync — leave empty for demo mode)
              </span>
            </Label>
            <Input
              type={showPassword ? "text" : "password"}
              value={imapPassword}
              onChange={(e) => setImapPassword(e.target.value)}
              placeholder="App-specific password"
              className="text-sm"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? "Hide" : "Show"} password
            </button>
            <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
              For Gmail: use an{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                App Password
              </a>
              , not your regular password. Without a password, sync runs in demo mode with sample emails.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-2.5 flex items-start gap-2">
            <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your credentials are stored locally and never sent to external
              servers. Emails are analyzed by the AI to categorize importance —
              only subject + body snippets are sent, not your full mailbox.
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-destructive leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setError("") }}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={connecting || !emailAddress.trim()}>
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {verifying ? "Verifying IMAP..." : "Connecting..."}
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4 mr-1" />
                {imapPassword.trim() ? "Verify & Connect" : "Connect (Demo Mode)"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BriefingDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { data, isLoading } = useQuery<{
    briefing: string
    stats: { total: number; urgent: number; important: number; needReply: number; newsletters: number }
  }>({
    queryKey: ["inbox-briefing"],
    queryFn: async () => {
      const r = await fetch("/api/inbox/briefing")
      return r.json()
    },
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Daily Email Briefing
          </DialogTitle>
          <DialogDescription>
            AI-generated summary of your last 24 hours of emails.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          {!isLoading && data && (
            <div className="space-y-3">
              {/* Quick stats */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {data.stats.total} total
                </Badge>
                {data.stats.urgent > 0 && (
                  <Badge className="text-[10px] bg-red-600 hover:bg-red-600 gap-0.5">
                    <Zap className="h-2.5 w-2.5" />
                    {data.stats.urgent} urgent
                  </Badge>
                )}
                {data.stats.needReply > 0 && (
                  <Badge className="text-[10px] bg-amber-600 hover:bg-amber-600 gap-0.5">
                    <Reply className="h-2.5 w-2.5" />
                    {data.stats.needReply} need reply
                  </Badge>
                )}
                {data.stats.important > 0 && (
                  <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600 gap-0.5">
                    {data.stats.important} important
                  </Badge>
                )}
                {data.stats.newsletters > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {data.stats.newsletters} newsletters
                  </Badge>
                )}
              </div>

              {/* Briefing content */}
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm leading-relaxed">
                <MarkdownPreviewContent content={data.briefing} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Simple markdown content renderer for the briefing
function MarkdownPreviewContent({ content }: { content: string }) {
  return (
    <div className="prose-sm">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-base font-semibold mt-2 mb-1">
              {line.replace("## ", "")}
            </h2>
          )
        }
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="text-sm font-semibold mt-2 mb-1">
              {line.replace("### ", "")}
            </h3>
          )
        }
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="text-xs ml-4 list-disc">
              <span dangerouslySetInnerHTML={{ __html: line.replace(/- /, "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            </li>
          )
        }
        if (line.startsWith("**")) {
          return (
            <p key={i} className="text-xs font-semibold mt-1">
              <span dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            </p>
          )
        }
        if (line.trim()) {
          return (
            <p key={i} className="text-xs my-1">
              <span dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            </p>
          )
        }
        return null
      })}
    </div>
  )
}
