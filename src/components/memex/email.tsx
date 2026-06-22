"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Mail,
  Send,
  CheckCircle2,
  Clock,
  Trash2,
  Plus,
  Loader2,
  CalendarClock,
  Inbox,
  FileText,
  Brain,
  MessageSquare,
  Sparkles,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { useMemex } from "./store"
import type { EmailData } from "./types"

type Tab = "all" | "delivered" | "scheduled" | "queued" | "digest"

const SOURCE_ICON: Record<string, React.ElementType> = {
  manual: Mail,
  chat: MessageSquare,
  decision: Brain,
  note: FileText,
  digest: CalendarClock,
}

export function Email() {
  const [tab, setTab] = useState<Tab>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const openEmail = useMemex((s) => s.openEmailComposer)
  const qc = useQueryClient()

  const params = new URLSearchParams()
  if (tab === "delivered") params.set("status", "delivered")
  if (tab === "scheduled") params.set("status", "scheduled")
  if (tab === "queued") params.set("status", "queued")
  if (tab === "digest") params.set("sourceType", "digest")

  const { data, isLoading } = useQuery<{ emails: EmailData[] }>({
    queryKey: ["emails", tab],
    queryFn: async () => {
      const r = await fetch(`/api/emails?${params.toString()}`)
      return r.json()
    },
  })

  const emails = data?.emails ?? []

  const handleDigest = async () => {
    try {
      const r = await fetch("/api/emails/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      })
      const d = await r.json()
      if (d.skipped) {
        toast.info("No new activity", {
          description: "Nothing to digest from the last 24 hours.",
        })
      } else {
        toast.success("Digest delivered", { description: d.subject })
        qc.invalidateQueries({ queryKey: ["emails"] })
        qc.invalidateQueries({ queryKey: ["stats"] })
      }
    } catch {
      toast.error("Digest failed")
    }
  }

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-full lg:w-96 shrink-0 flex flex-col border-r border-border">
        {/* Toolbar */}
        <div className="p-3 border-b border-border space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Outbox
            </h2>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={handleDigest}
                title="Generate + send daily digest"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Digest
              </Button>
              <Button
                size="sm"
                onClick={() => openEmail({ sourceType: "manual" as const })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Compose
              </Button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 text-xs">
            {(["all", "delivered", "scheduled", "queued", "digest"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded-md font-medium capitalize transition-colors ${
                  tab === t
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Email list */}
        <ScrollArea className="flex-1 thin-scroll">
          <div className="p-2 space-y-1">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && emails.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium">No emails here</p>
                <p className="text-xs text-muted-foreground">
                  Compose one or trigger a digest.
                </p>
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

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <EmailDetailPanel id={selectedId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Mail className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Email integration</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Compose emails from any Memex surface — chat answers, decisions,
                notes, or daily digests. Emails are rendered Markdown → HTML and
                delivered through a simulated SMTP pipeline.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEmail({ sourceType: "manual" as const })}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Compose
              </Button>
              <Button size="sm" variant="outline" onClick={handleDigest}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Run digest
              </Button>
            </div>
          </div>
        )}
      </div>
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
  const Icon = SOURCE_ICON[email.sourceType] ?? Mail
  return (
    <div
      className={`group rounded-md p-2.5 cursor-pointer transition-colors ${
        active ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10">
          <Icon className="h-3 w-3 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium truncate">{email.subject}</span>
            <StatusBadge status={email.status} />
          </div>
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
            to: {email.toAddress}
          </div>
          <div className="flex items-center justify-between mt-1">
            <Badge variant="outline" className="text-[9px] h-4 capitalize">
              {email.sourceType}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {new Date(email.queuedAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "delivered")
    return (
      <Badge className="text-[9px] h-4 bg-emerald-600 hover:bg-emerald-600 gap-0.5">
        <CheckCircle2 className="h-2.5 w-2.5" />
        delivered
      </Badge>
    )
  if (status === "sent")
    return (
      <Badge className="text-[9px] h-4 bg-teal-600 hover:bg-teal-600 gap-0.5">
        <Send className="h-2.5 w-2.5" />
        sent
      </Badge>
    )
  if (status === "scheduled")
    return (
      <Badge className="text-[9px] h-4 bg-amber-600 hover:bg-amber-600 gap-0.5">
        <Clock className="h-2.5 w-2.5" />
        scheduled
      </Badge>
    )
  if (status === "queued")
    return (
      <Badge variant="secondary" className="text-[9px] h-4 gap-0.5">
        <Clock className="h-2.5 w-2.5" />
        queued
      </Badge>
    )
  return <Badge variant="destructive" className="text-[9px] h-4">{status}</Badge>
}

function EmailDetailPanel({ id }: { id: string }) {
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

  const email = data.email

  return (
    <ScrollArea className="h-full thin-scroll">
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl memex-fade-up">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold leading-tight flex-1">
              {email.subject}
            </h1>
            <StatusBadge status={email.status} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span className="text-muted-foreground">From: </span>
              <span className="font-medium">{email.fromName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">To: </span>
              <span className="font-medium">{email.toAddress}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Queued: </span>
              <span>{new Date(email.queuedAt).toLocaleString()}</span>
            </div>
            {email.deliveredAt && (
              <div>
                <span className="text-muted-foreground">Delivered: </span>
                <span>{new Date(email.deliveredAt).toLocaleString()}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Source: </span>
              <Badge variant="outline" className="text-[10px] capitalize">
                {email.sourceType}
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        {/* HTML preview */}
        <Card>
          <CardContent className="p-0">
            <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center justify-between">
              <span>Rendered email</span>
              <span className="text-foreground/60 normal-case">
                {email.bodyMarkdown.length} chars · markdown → html
              </span>
            </div>
            <div
              className="p-4 text-sm prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml || "<p><em>No HTML body.</em></p>" }}
            />
          </CardContent>
        </Card>

        {/* Raw markdown */}
        <Card>
          <CardContent className="p-0">
            <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Markdown source
            </div>
            <pre className="p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">
              {email.bodyMarkdown}
            </pre>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
