"use client"

import { useDeferredValue, useState } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import { apiRequest, getErrorMessage } from "@/lib/client-api"
import { SectionError } from "./section-state"
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
type InboxSyncMode = "period" | "count"
type InboxSyncRange = "day" | "week" | "month" | "year"

const SYNC_RANGE_OPTIONS: Array<{ value: InboxSyncRange; label: string }> = [
  { value: "day", label: "Past 24 hours" },
  { value: "week", label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
  { value: "year", label: "Past 12 months" },
]

const SYNC_COUNT_OPTIONS = [25, 50, 100] as const

type InboxThread = {
  threadId: string
  emails: InboxEmailData[]
  count: number
}

type InboxResponse = {
  emails: InboxEmailData[]
  threads?: InboxThread[]
  analysis?: Record<string, number>
}

export function Inbox_() {
  const [tab, setTab] = useState<InboxTab>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { isMobile } = useDevice()
  const [syncing, setSyncing] = useState(false)
  const [syncMode, setSyncMode] = useState<InboxSyncMode>("period")
  const [syncRange, setSyncRange] = useState<InboxSyncRange>("week")
  const [syncCount, setSyncCount] = useState<number>(25)
  const [connectOpen, setConnectOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [briefingOpen, setBriefingOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [threaded, setThreaded] = useState(false)
  const deferredSearch = useDeferredValue(search)
  const qc = useQueryClient()

  const params = new URLSearchParams()
  if (tab === "urgent") params.set("category", "urgent")
  if (tab === "important") params.set("category", "important")
  if (tab === "normal") params.set("category", "normal")
  if (tab === "newsletter") params.set("category", "newsletter")
  if (tab === "unread") params.set("unread", "true")
  if (deferredSearch) params.set("q", deferredSearch)
  if (threaded) params.set("threaded", "true")

  const inboxQuery = useQuery<InboxResponse>({
    queryKey: ["inbox", tab, deferredSearch, threaded],
    queryFn: () => apiRequest(`/api/inbox?${params.toString()}`),
  })
  const { data: inboxData, isLoading } = inboxQuery

  const accountsQuery = useQuery<{ accounts: EmailAccountData[] }>({
    queryKey: ["email-accounts"],
    queryFn: () => apiRequest("/api/email-accounts"),
  })

  const accounts = accountsQuery.data?.accounts ?? []
  const connectedAccounts = accounts.filter((a) => a.connected)
  const rawEmails = inboxData?.emails ?? []
  const pendingAnalysis = (inboxData?.analysis?.queued ?? 0) + (inboxData?.analysis?.processing ?? 0) + (inboxData?.analysis?.deferred ?? 0)
  const threads = inboxData?.threads ?? []
  const emails = threaded
    ? threads.map((thread) => thread.emails[0]).filter((email): email is InboxEmailData => Boolean(email))
    : rawEmails
  const threadCounts = new Map(
    threads
      .filter((thread) => thread.emails[0])
      .map((thread) => [thread.emails[0].id, thread.count])
  )
  const liveConnectedAccounts = connectedAccounts.filter((account) => account.syncMode === "real" || account.syncMode === "oauth")
  const hasRealAccount = liveConnectedAccounts.length > 0
  const hasLegacyDemoAccount = connectedAccounts.some((account) => account.syncMode === "demo")
  const syncRangeLabel = SYNC_RANGE_OPTIONS.find((option) => option.value === syncRange)?.label ?? "selected range"
  const lastSyncAt = liveConnectedAccounts
    .map((account) => account.lastSyncAt ? new Date(account.lastSyncAt) : null)
    .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0]

  const handleSync = async () => {
    if (!hasRealAccount) {
      setConnectOpen(true)
      return
    }
    setSyncing(true)
    try {
      const d = await apiRequest<{
        added: number
        message?: string
        warning?: string
        analysisQueued?: number
      }>("/api/inbox/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          syncMode === "period"
            ? { scope: "period", range: syncRange }
            : { scope: "count", count: syncCount }
        ),
      })
      if (d.warning) {
        toast.warning(d.warning, { description: d.message })
      } else if (d.added > 0) {
        toast.success(d.message || `Synced ${d.added} new emails.`)
      } else {
        toast.info(d.message || "Inbox is up to date.")
      }
      qc.invalidateQueries({ queryKey: ["inbox"] })
      qc.invalidateQueries({ queryKey: ["email-accounts"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      if ((d.analysisQueued ?? 0) > 0) {
        window.setTimeout(() => qc.invalidateQueries({ queryKey: ["inbox"] }), 4_000)
      }
    } catch (error) {
      toast.error("Sync failed", { description: getErrorMessage(error) })
    } finally {
      setSyncing(false)
    }
  }

  if (inboxQuery.isError || accountsQuery.isError) {
    const failedQuery = inboxQuery.isError ? inboxQuery : accountsQuery
    return (
      <SectionError
        title="Inbox could not be loaded"
        error={failedQuery.error}
        onRetry={() => {
          inboxQuery.refetch()
          accountsQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* List — hidden entirely when no emails and no account (empty state takes full width) */}
      <div className={`${(emails.length === 0 && connectedAccounts.length === 0) ? "hidden" : selectedId && isMobile ? "hidden" : "flex"} w-full lg:w-[420px] xl:w-[440px] shrink-0 flex-col border-r border-border`}>
        {/* Stable sidebar controls: title, categories, sync scope, then search. */}
        <div className="border-b border-border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Inbox className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-sm font-semibold">Smart Inbox</h2>
                  {hasLegacyDemoAccount && (
                    <Badge className="h-4 gap-0.5 bg-amber-500 text-[9px] hover:bg-amber-500" title="Reconnect this legacy sample account using OAuth or advanced IMAP.">
                      <AlertCircle className="h-2.5 w-2.5" />
                      Reconnect
                    </Badge>
                  )}
                  {hasRealAccount && (
                    <Badge className="h-4 gap-0.5 bg-emerald-600 text-[9px] hover:bg-emerald-600" title="Live email account connected">
                      <Wifi className="h-2.5 w-2.5" />
                      Live
                    </Badge>
                  )}
                  {pendingAnalysis > 0 && (
                    <Badge variant="secondary" className="h-4 gap-0.5 text-[9px]" title="Messages waiting for paced AI organization">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      AI {pendingAnalysis}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-[10px] text-muted-foreground">
                  {hasRealAccount
                    ? `${liveConnectedAccounts.length} live account${liveConnectedAccounts.length !== 1 ? "s" : ""}`
                    : hasLegacyDemoAccount
                      ? "Reconnect a legacy sample account"
                      : "No account connected"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {connectedAccounts.length > 0 && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setManageOpen(true)} title="Manage connected accounts" aria-label="Manage connected accounts">
                  <Wifi className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConnectOpen(true)} title="Connect email account" aria-label="Connect email account">
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setBriefingOpen(true)} title="Daily AI email briefing" aria-label="Daily AI email briefing">
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1" aria-label="Inbox categories">
            {(["all", "urgent", "important", "unread", "newsletter"] as InboxTab[]).map((category) => (
              <button
                key={category}
                onClick={() => setTab(category)}
                className={`h-7 min-w-0 rounded-md px-1 text-[10px] font-medium capitalize transition-colors ${
                  tab === category
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="block truncate">{category}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search inbox..."
                className="h-8 w-full rounded-md border border-border bg-muted/30 pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary/40 focus:bg-background"
              />
            </div>
            <button
              onClick={() => setThreaded(!threaded)}
              className={`flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] transition-colors ${
                threaded
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title="Group emails by conversation"
              aria-label="Group emails by conversation"
            >
              <Mail className="h-3 w-3" />
              Threads
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-2.5 text-[10px]"
                  aria-label="Open inbox sync options"
                >
                  <RefreshCw className="h-3 w-3" />
                  Sync
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3 p-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold">Sync inbox</p>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Choose one method. AI organization continues after messages are imported.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" aria-label="Sync method">
                  {(["period", "count"] as InboxSyncMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSyncMode(mode)}
                      className={`h-7 rounded px-2 text-[10px] font-medium transition-colors ${
                        syncMode === mode
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {mode === "period" ? "By period" : "By amount"}
                    </button>
                  ))}
                </div>
                {syncMode === "period" ? (
                  <Select value={syncRange} onValueChange={(value) => setSyncRange(value as InboxSyncRange)}>
                    <SelectTrigger className="h-9 w-full text-xs" aria-label="Email sync period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYNC_RANGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-xs">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={String(syncCount)} onValueChange={(value) => setSyncCount(Number(value))}>
                    <SelectTrigger className="h-9 w-full text-xs" aria-label="Number of newest emails to sync">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYNC_COUNT_OPTIONS.map((count) => (
                        <SelectItem key={count} value={String(count)} className="text-xs">
                          Latest {count}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="space-y-2">
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    {syncMode === "period"
                      ? `Import new mail received in ${syncRangeLabel.toLowerCase()}.`
                      : `Import the latest ${syncCount} new messages, regardless of date.`}
                  </p>
                  <Button className="h-9 w-full text-xs" onClick={handleSync} disabled={syncing}>
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">
                      {syncMode === "period" ? "Sync this period" : `Sync latest ${syncCount}`}
                    </span>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
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
                threadCount={threadCounts.get(e.id)}
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
            <InboxDetailPanel id={selectedId} onRemoved={() => setSelectedId(null)} />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center overflow-auto px-6 py-8 text-center">
            <div className="flex max-w-sm flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40">
                <MailOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">
                  {connectedAccounts.length > 0 ? "No message selected" : "Connect an email account"}
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {connectedAccounts.length > 0
                    ? "Choose an email from the inbox to read, reply, archive, or turn it into a note."
                    : "Connect Google or Microsoft for password-free live mail, or use advanced IMAP/SMTP."}
                </p>
              </div>
              {connectedAccounts.length > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                  <span>{emails.length} message{emails.length === 1 ? "" : "s"} in this view</span>
                  {lastSyncAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Last synced {lastSyncAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                    </>
                  )}
                </div>
              ) : (
                <Button size="sm" onClick={() => setConnectOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Connect email
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
  threadCount,
}: {
  email: InboxEmailData
  active: boolean
  onClick: () => void
  threadCount?: number
}) {
  const cat = CATEGORY_CONFIG[email.category] ?? CATEGORY_CONFIG.normal
  const CatIcon = cat.icon
  const qc = useQueryClient()

  const handleStar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await apiRequest(`/api/inbox/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStarred: !email.isStarred }),
      })
      qc.invalidateQueries({ queryKey: ["inbox"] })
    } catch (error) {
      toast.error("Star could not be updated", { description: getErrorMessage(error) })
    }
  }

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await apiRequest(`/api/inbox/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      })
      toast.success("Email archived")
      qc.invalidateQueries({ queryKey: ["inbox"] })
    } catch (error) {
      toast.error("Email could not be archived", { description: getErrorMessage(error) })
    }
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
            {threadCount && threadCount > 1 && (
              <Badge variant="outline" className="text-[9px] h-4">
                {threadCount} messages
              </Badge>
            )}
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

function InboxDetailPanel({ id, onRemoved }: { id: string; onRemoved: () => void }) {
  const qc = useQueryClient()
  const openEmail = useMemex((s) => s.openEmailComposer)
  const [replyOpen, setReplyOpen] = useState(false)

  const detailQuery = useQuery<{ email: InboxEmailData }>({
    queryKey: ["inbox-email", id],
    queryFn: () => apiRequest(`/api/inbox/${id}`),
  })
  const { data, isLoading } = detailQuery

  if (detailQuery.isError) {
    return (
      <SectionError
        title="Message could not be loaded"
        error={detailQuery.error}
        onRetry={() => detailQuery.refetch()}
      />
    )
  }

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
    if (!window.confirm("Remove this message from Memex? The original remains with your email provider.")) return
    try {
      await apiRequest(`/api/inbox/${id}`, { method: "DELETE" })
      toast.success("Email removed from Memex", {
        description: "The original email is still in your email provider.",
      })
      onRemoved()
      qc.invalidateQueries({ queryKey: ["inbox"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
    } catch (error) {
      toast.error("Email could not be removed", { description: getErrorMessage(error) })
    }
  }

  const handleDeleteFromProvider = async () => {
    const confirmed = window.confirm(
      "This will PERMANENTLY DELETE the email from your email provider (Gmail/Outlook).\n\n" +
      "This cannot be undone. The email will also be removed from Memex.\n\n" +
      "Are you sure?"
    )
    if (!confirmed) return

    try {
      const d = await apiRequest<{ message?: string }>(
        `/api/inbox/${id}/delete-from-provider`,
        { method: "POST" }
      )
      toast.success(d.message || "Email deleted from provider")
      onRemoved()
      qc.invalidateQueries({ queryKey: ["inbox"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
    } catch (error) {
      toast.error("Provider deletion failed", { description: getErrorMessage(error) })
    }
  }

  const handleStar = async () => {
    try {
      await apiRequest(`/api/inbox/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStarred: !e.isStarred }),
      })
      qc.invalidateQueries({ queryKey: ["inbox"] })
      qc.invalidateQueries({ queryKey: ["inbox-email", id] })
    } catch (error) {
      toast.error("Star could not be updated", { description: getErrorMessage(error) })
    }
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
                    const d = await apiRequest<{ message?: string }>(
                      `/api/inbox/${id}/to-note`,
                      { method: "POST" }
                    )
                    toast.success(d.message || "Email converted to note")
                    window.dispatchEvent(new CustomEvent("memex-notes-updated"))
                  } catch (error) {
                    toast.error("Conversion failed", { description: getErrorMessage(error) })
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
      const d = await apiRequest<{ draft: string }>(`/api/inbox/${emailId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      })
      setDraft(d.draft)
    } catch (error) {
      toast.error("Failed to generate draft", { description: getErrorMessage(error) })
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
  const accountsQuery = useQuery<{ accounts: EmailAccountData[] }>({
    queryKey: ["email-accounts"],
    queryFn: () => apiRequest("/api/email-accounts"),
    enabled: open,
  })
  const { data, isLoading } = accountsQuery

  const accounts = (data?.accounts ?? []).filter((a) => a.connected)

  const handleDisconnect = async (emailAddress: string) => {
    if (!window.confirm(`Disconnect ${emailAddress}? Existing imported messages stay in Memex.`)) return
    try {
      await apiRequest("/api/email-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress }),
      })
      toast.success(`Disconnected ${emailAddress}`)
      qc.invalidateQueries({ queryKey: ["email-accounts"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
    } catch (error) {
      toast.error("Account could not be disconnected", { description: getErrorMessage(error) })
    }
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
          {accountsQuery.isError && (
            <SectionError
              title="Accounts could not be loaded"
              error={accountsQuery.error}
              onRetry={() => accountsQuery.refetch()}
            />
          )}
          {!isLoading && !accountsQuery.isError && accounts.length === 0 && (
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
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium truncate">{a.displayName}</div>
                  <Badge variant={a.syncMode === "demo" ? "secondary" : "default"} className="text-[9px] h-4">
                    {a.syncMode === "oauth" ? (a.provider === "google" ? "Google" : "Microsoft") : a.syncMode === "real" ? "IMAP" : "Legacy demo"}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {a.emailAddress}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {a.syncMode === "oauth" ? `OAuth: ${a.provider === "google" ? "Google" : "Microsoft"}` : `IMAP: ${a.imapHost}:${a.imapPort} · SMTP: ${a.smtpHost}:${a.smtpPort}`}
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
        <div className="rounded-md border border-border bg-muted/30 p-2.5 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Google and Microsoft accounts sync and send through their provider APIs. Advanced accounts use verified IMAP and SMTP. Legacy demo accounts must be reconnected before syncing.
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
  const [error, setError] = useState("")
  const oauthStatusQuery = useQuery<{
    providers: { google: boolean; microsoft: boolean }
  }>({
    queryKey: ["email-oauth-status"],
    queryFn: () => apiRequest("/api/email-accounts/oauth/status"),
    enabled: open,
  })
  const providers = oauthStatusQuery.data?.providers

  const startOAuth = (provider: "google" | "microsoft") => {
    if (!providers?.[provider]) {
      setError(
        `${provider === "google" ? "Google" : "Microsoft"} connection is not configured by this Memex administrator yet.`
      )
      return
    }
    window.location.assign(`/api/email-accounts/oauth/${provider}`)
  }

  const handleAdvancedConnect = async () => {
    if (!emailAddress.trim() || !imapPassword.trim()) {
      setError("Enter an email address and app password for the advanced connection.")
      return
    }
    setError("")
    setConnecting(true)
    try {
      const data = await apiRequest<{
        message?: string
        verified: boolean
        syncMode: "real"
      }>("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAddress: emailAddress.trim(),
          displayName: displayName.trim() || undefined,
          imapPassword: imapPassword.trim(),
        }),
      })
      toast.success(data.message || "Advanced email account connected", {
        description: "IMAP and SMTP were verified.",
      })
      setEmailAddress("")
      setDisplayName("")
      setImapPassword("")
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ["email-accounts"] })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
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
            Connect email account
          </DialogTitle>
          <DialogDescription>
            Sign in with your provider to connect inbox sync and sending without sharing an email password with Memex.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-start gap-3"
              onClick={() => startOAuth("google")}
              disabled={oauthStatusQuery.isLoading || providers?.google === false}
              title={providers?.google === false ? "Google OAuth must be configured by the application owner." : undefined}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-sm border text-xs font-semibold text-red-500">G</span>
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-start gap-3"
              onClick={() => startOAuth("microsoft")}
              disabled={oauthStatusQuery.isLoading || providers?.microsoft === false}
              title={providers?.microsoft === false ? "Microsoft OAuth must be configured by the application owner." : undefined}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-sm border text-xs font-semibold text-sky-600">M</span>
              Continue with Microsoft
            </Button>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-2.5 flex items-start gap-2">
            <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              You sign in on Google or Microsoft&apos;s page. Memex stores encrypted connection tokens, never your mailbox password. AI categorization still sends the sender, subject, and up to 2,000 message characters to your configured AI provider.
            </p>
          </div>

          <details className="rounded-md border border-border px-3 py-2.5">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Advanced IMAP/SMTP connection
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Use this only for providers without OAuth support in Memex, such as a custom, Yahoo, or iCloud mailbox. Use an app-specific password, never your regular password.
              </p>
              <div className="space-y-1">
                <Label className="text-xs">Email address</Label>
                <Input
                  value={emailAddress}
                  onChange={(event) => setEmailAddress(event.target.value)}
                  placeholder="you@example.com"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display name (optional)</Label>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">App password</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={imapPassword}
                  onChange={(event) => setImapPassword(event.target.value)}
                  placeholder="App-specific password"
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? "Hide" : "Show"} password
                </button>
              </div>
              <Button type="button" size="sm" onClick={handleAdvancedConnect} disabled={connecting}>
                {connecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wifi className="mr-1 h-4 w-4" />}
                Verify advanced connection
              </Button>
            </div>
          </details>

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
  const briefingQuery = useQuery<{
    briefing: string
    stats: { total: number; urgent: number; important: number; needReply: number; newsletters: number }
  }>({
    queryKey: ["inbox-briefing"],
    queryFn: () => apiRequest("/api/inbox/briefing"),
    enabled: open,
  })
  const { data, isLoading } = briefingQuery

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
          {briefingQuery.isError && (
            <SectionError
              title="Briefing could not be generated"
              error={briefingQuery.error}
              onRetry={() => briefingQuery.refetch()}
            />
          )}
          {!isLoading && !briefingQuery.isError && data && (
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
