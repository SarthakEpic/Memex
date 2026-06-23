"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Send,
  CheckCircle2,
  Clock,
  Trash2,
  Plus,
  Loader2,
  CalendarClock,
  FileText,
  Brain,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Search,
  AlertTriangle,
  RotateCw,
  XCircle,
  Bot,
  Shield,
  Mail,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useMemex } from "./store"
import type { EmailData } from "./types"

type Tab = "all" | "delivered" | "failed" | "pending_verification" | "scheduled" | "cancelled" | "ai"

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  delivered: { icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", label: "Delivered" },
  sent: { icon: Send, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10 border-teal-500/30", label: "Sent" },
  sending: { icon: Loader2, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", label: "Sending..." },
  pending_verification: { icon: Shield, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", label: "Needs Verification" },
  queued: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted border-border", label: "Queued" },
  scheduled: { icon: CalendarClock, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", label: "Scheduled" },
  failed: { icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border-red-500/30", label: "Failed" },
  cancelled: { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted border-border", label: "Cancelled" },
  draft: { icon: FileText, color: "text-muted-foreground", bg: "bg-muted border-border", label: "Draft" },
}

const SOURCE_ICON: Record<string, React.ElementType> = {
  manual: Mail,
  chat: MessageSquare,
  decision: Brain,
  note: FileText,
  digest: CalendarClock,
  ai: Bot,
}

export function Email() {
  const [tab, setTab] = useState<Tab>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const openEmail = useMemex((s) => s.openEmailComposer)
  const qc = useQueryClient()

  const params = new URLSearchParams()
  if (tab === "delivered") params.set("status", "delivered")
  if (tab === "failed") params.set("status", "failed")
  if (tab === "pending_verification") params.set("status", "pending_verification")
  if (tab === "scheduled") params.set("status", "scheduled")
  if (tab === "cancelled") params.set("status", "cancelled")

  const { data, isLoading } = useQuery<{ emails: EmailData[] }>({
    queryKey: ["emails", tab],
    queryFn: async () => {
      const r = await fetch(`/api/emails?${params.toString()}`)
      return r.json()
    },
  })

  const allEmails = data?.emails ?? []
  const emails = search
    ? allEmails.filter(
        (e) =>
          e.toAddress.toLowerCase().includes(search.toLowerCase()) ||
          e.subject.toLowerCase().includes(search.toLowerCase()) ||
          e.bodyMarkdown.toLowerCase().includes(search.toLowerCase())
      )
    : tab === "ai"
    ? allEmails.filter((e) => e.isAiGenerated)
    : allEmails

  const handleDigest = async () => {
    try {
      const r = await fetch("/api/emails/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      })
      const d = await r.json()
      if (d.skipped) {
        toast.info("No new activity", { description: "Nothing to digest from the last 24 hours." })
      } else {
        toast.success("Digest delivered", { description: d.subject })
        qc.invalidateQueries({ queryKey: ["emails"] })
      }
    } catch {
      toast.error("Digest failed")
    }
  }

  return (
    <div className="flex h-full">
      {/* List */}
      <div className={`${selectedId ? "hidden lg:flex" : "flex"} w-full lg:w-96 shrink-0 flex-col border-r border-border`}>
        {/* Toolbar */}
        <div className="p-3 border-b border-border space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Sent
            </h2>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDigest} title="Generate daily digest">
                <RefreshCw className="h-3 w-3 mr-1" />
                Digest
              </Button>
              <Button size="sm" onClick={() => openEmail({ sourceType: "manual" as const })}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Compose
              </Button>
            </div>
          </div>

          {/* Status dashboard mini-stats */}
          <div className="grid grid-cols-4 gap-1.5">
            <StatPill label="Delivered" count={allEmails.filter((e) => e.status === "delivered").length} color="emerald" />
            <StatPill label="Failed" count={allEmails.filter((e) => e.status === "failed").length} color="red" />
            <StatPill label="Pending" count={allEmails.filter((e) => e.status === "pending_verification").length} color="amber" />
            <StatPill label="Scheduled" count={allEmails.filter((e) => e.status === "scheduled").length} color="purple" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 text-xs flex-wrap">
            {(["all", "delivered", "failed", "pending_verification", "scheduled", "cancelled", "ai"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2 py-0.5 rounded-md font-medium capitalize transition-colors ${
                  tab === t
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {t === "ai" ? "AI Drafts" : t === "pending_verification" ? "Verify" : t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sent emails..."
              className="w-full text-xs pl-7 pr-2 h-7 rounded-md border border-border bg-background outline-none focus:border-primary/40"
            />
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
                <Send className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium">No emails here</p>
                <p className="text-xs text-muted-foreground">Compose one or trigger a digest.</p>
              </div>
            )}
            {emails.map((e) => (
              <EmailListItem
                key={e.id}
                email={e}
                active={selectedId === e.id}
                onClick={() => setSelectedId(e.id)}
                onDelete={async () => {
                  await fetch(`/api/emails/${e.id}`, { method: "DELETE" })
                  toast.success("Email deleted")
                  if (selectedId === e.id) setSelectedId(null)
                  qc.invalidateQueries({ queryKey: ["emails"] })
                  qc.invalidateQueries({ queryKey: ["stats"] })
                }}
              />
            ))}
          </div>
          </ScrollArea>
        </div>
      </div>

      {/* Detail */}
      <div className={`${selectedId ? "flex" : "hidden lg:flex"} flex-1 min-w-0`}>
        {selectedId ? (
          <div className="w-full">
            <button
              onClick={() => setSelectedId(null)}
              className="lg:hidden flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground border-b border-border"
            >
              ← Back to sent
            </button>
            <EmailDetailPanel id={selectedId} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Send className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Sent Emails</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                All emails sent from Memex appear here. AI-generated emails require
                human verification before sending. Failed emails can be resent.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEmail({ sourceType: "manual" as const })}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Compose
              </Button>
              <Button size="sm" variant="outline" onClick={handleDigest}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Run digest
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  const colorClass: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
    red: "text-red-600 dark:text-red-400 bg-red-500/5",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/5",
    purple: "text-purple-600 dark:text-purple-400 bg-purple-500/5",
  }
  return (
    <div className={`rounded-md px-1.5 py-1 text-center ${colorClass[color]}`}>
      <div className="text-sm font-semibold tabular-nums">{count}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  )
}

function EmailListItem({
  email,
  active,
  onClick,
  onDelete,
}: {
  email: EmailData
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const cat = STATUS_CONFIG[email.status] ?? STATUS_CONFIG.queued
  const CatIcon = cat.icon
  const SrcIcon = SOURCE_ICON[email.sourceType] ?? Mail

  return (
    <div
      className={`group rounded-md p-2.5 cursor-pointer transition-colors ${
        active ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div className={`shrink-0 rounded p-1 border ${cat.bg}`}>
          <CatIcon className={`h-3 w-3 ${cat.color} ${email.status === "sending" ? "animate-spin" : ""}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium truncate">{email.subject}</span>
            <span className="text-[9px] text-muted-foreground shrink-0">
              {new Date(email.queuedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
            To: {email.toAddress}
          </div>
          {email.errorMessage && (
            <div className="text-[10px] text-red-500 truncate mt-0.5">⚠ {email.errorMessage}</div>
          )}
          <div className="flex items-center gap-1 mt-1">
            <Badge variant="outline" className={`text-[9px] h-4 ${cat.bg} ${cat.color} border-0`}>
              {cat.label}
            </Badge>
            {email.isAiGenerated && (
              <Badge className="text-[9px] h-4 gap-0.5 bg-violet-600 hover:bg-violet-600">
                <Bot className="h-2 w-2" />
                AI
              </Badge>
            )}
            <SrcIcon className="h-2.5 w-2.5 text-muted-foreground" />
            {email.attempts > 1 && (
              <span className="text-[9px] text-muted-foreground">{email.attempts} attempts</span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function EmailDetailPanel({ id }: { id: string }) {
  const qc = useQueryClient()
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  const { data, isLoading } = useQuery<{ email: EmailData }>({
    queryKey: ["email", id],
    queryFn: async () => {
      const r = await fetch(`/api/emails/${id}`)
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
  const cat = STATUS_CONFIG[e.status] ?? STATUS_CONFIG.queued
  const CatIcon = cat.icon

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const r = await fetch(`/api/emails/${id}/verify`, { method: "POST" })
      const d = await r.json()
      if (r.ok && d.delivered) {
        toast.success(d.message || "Email sent and verified ✓")
      } else {
        toast.error(d.message || d.error || "Verification/send failed")
      }
      qc.invalidateQueries({ queryKey: ["email", id] })
      qc.invalidateQueries({ queryKey: ["emails"] })
    } catch (e: any) {
      toast.error(e.message || "Verification failed")
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      const r = await fetch(`/api/emails/${id}/resend`, { method: "POST" })
      const d = await r.json()
      if (r.ok && d.delivered) {
        toast.success(d.message || "Email resent ✓")
      } else {
        toast.error(d.message || d.error || "Resend failed")
      }
      qc.invalidateQueries({ queryKey: ["email", id] })
      qc.invalidateQueries({ queryKey: ["emails"] })
    } catch (e: any) {
      toast.error(e.message || "Resend failed")
    } finally {
      setResending(false)
    }
  }

  const handleCancel = async () => {
    const r = await fetch(`/api/emails/${id}/cancel`, { method: "POST" })
    const d = await r.json()
    if (r.ok) {
      toast.success(d.message || "Email cancelled")
      qc.invalidateQueries({ queryKey: ["email", id] })
      qc.invalidateQueries({ queryKey: ["emails"] })
    } else {
      toast.error(d.error || "Cancel failed")
    }
  }

  return (
    <ScrollArea className="h-full thin-scroll">
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl memex-fade-up">
        {/* Header with status */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={`rounded p-1 border ${cat.bg}`}>
                  <CatIcon className={`h-3.5 w-3.5 ${cat.color} ${e.status === "sending" ? "animate-spin" : ""}`} />
                </div>
                <Badge variant="outline" className={`text-[10px] ${cat.bg} ${cat.color} border-0`}>
                  {cat.label}
                </Badge>
                {e.isAiGenerated && (
                  <Badge className="text-[10px] gap-0.5 bg-violet-600 hover:bg-violet-600">
                    <Bot className="h-2.5 w-2.5" />
                    AI Generated
                  </Badge>
                )}
                {e.attempts > 1 && (
                  <Badge variant="outline" className="text-[10px]">
                    {e.attempts} attempts
                  </Badge>
                )}
              </div>
              <h1 className="text-lg font-semibold leading-tight">{e.subject}</h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">To: {e.toAddress}</span>
                <span>·</span>
                <span>From: {e.fromName}</span>
                <span>·</span>
                <span>{new Date(e.queuedAt).toLocaleString()}</span>
              </div>
              {e.sentAt && (
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Sent at: {new Date(e.sentAt).toLocaleString()}
                </div>
              )}
              {e.lastAttemptAt && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Last attempt: {new Date(e.lastAttemptAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error message */}
        {e.errorMessage && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-red-500">Error</div>
                <p className="text-xs text-muted-foreground mt-0.5">{e.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Verification required banner */}
        {e.status === "pending_verification" && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Human Verification Required
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  This email was drafted by AI. To prevent unauthorized sending,
                  please verify you're human before sending.
                </p>
                <Button
                  size="sm"
                  className="mt-2 h-7 text-xs"
                  onClick={handleVerify}
                  disabled={verifying}
                >
                  {verifying ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 mr-1" />
                  )}
                  Verify & Send
                </Button>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Email body */}
        <Card>
          <CardContent className="p-4">
            <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
              {e.bodyMarkdown}
            </pre>
          </CardContent>
        </Card>

        {/* Rendered HTML */}
        {e.bodyHtml && (
          <Card>
            <CardContent className="p-0">
              <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Rendered HTML Preview
              </div>
              <div
                className="p-4 text-sm prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: e.bodyHtml }}
              />
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          {(e.status === "failed" || e.status === "cancelled") && (
            <Button size="sm" variant="outline" onClick={handleResend} disabled={resending}>
              {resending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCw className="h-3.5 w-3.5 mr-1" />}
              Resend
            </Button>
          )}
          {(e.status === "pending_verification" || e.status === "scheduled" || e.status === "queued") && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={handleCancel}>
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Cancel Send
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(e.bodyMarkdown)
              toast.success("Copied to clipboard")
            }}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            Copy
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}
