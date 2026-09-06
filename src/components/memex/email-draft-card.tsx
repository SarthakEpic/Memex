"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Send,
  Mail,
  Pencil,
  Check,
  X,
  RefreshCw,
  Save,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronRight,
  Inbox,
  Archive,
  Star,
  ListTodo,
  Trash2,
  Reply,
} from "lucide-react"
import { toast } from "sonner"
import { apiRequest, getErrorMessage } from "@/lib/client-api"
import type { EmailDraftPayload, EmailTimelineEvent } from "./types"
import { MarkdownPreview } from "./markdown-preview"

// ─────────────────────────────────────────────────────────────────────────────
// Status indicator — small badge showing the current state of the email draft.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EmailDraftPayload["status"],
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  draft: { label: "Draft Created", color: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30", icon: FileText },
  sending: { label: "Sending…", color: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30", icon: Loader2 },
  saved: { label: "Saved locally", color: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30", icon: Save },
  sent: { label: "Sent Successfully", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  failed: { label: "Failed", color: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30", icon: AlertCircle },
  scheduled: { label: "Scheduled", color: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30", icon: Clock },
  cancelled: { label: "Cancelled", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30", icon: X },
}

function StatusIndicator({ status }: { status: EmailDraftPayload["status"] }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 px-2 py-0.5 ${cfg.color} border`}>
      <Icon className={`h-3 w-3 ${status === "sending" ? "animate-spin" : ""}`} />
      {cfg.label}
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline — expandable list of actions taken on this draft.
// ─────────────────────────────────────────────────────────────────────────────

function EmailTimeline({ events }: { events: EmailTimelineEvent[] }) {
  const [open, setOpen] = useState(false)
  if (events.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border pt-2 mt-2">
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="font-medium">Timeline</span>
          <Badge variant="secondary" className="text-[9px] h-4 px-1">{events.length}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <ol className="space-y-1.5 text-[11px] border-l border-border pl-3 ml-1">
          {events.map((ev, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[14px] top-1 flex h-2 w-2 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <div className="font-medium text-foreground">{ev.action}</div>
              <div className="text-muted-foreground text-[10px]">
                {new Date(ev.timestamp).toLocaleString()}
                {ev.details ? ` · ${ev.details}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EmailDraftCard — the main interactive component.
// Renders inside the chat conversation when an assistant message has
// an emailDraft payload. Lets the user:
//   - Edit recipient / subject / body inline
//   - Auto-regenerate subject from body (debounced, optional)
//   - Regenerate the whole draft with feedback
//   - Send the email (uses ONLY the displayed subject/body/recipient)
//   - Save as draft
//   - Schedule for later
//   - Cancel
//   - View a timeline of all actions taken
// ─────────────────────────────────────────────────────────────────────────────

interface EmailDraftCardProps {
  messageId: string
  initialDraft: EmailDraftPayload
  // The original user instruction that produced this draft — needed for regeneration
  instruction: string
  // Called when the draft state changes (status update, timeline event, etc.)
  // so the parent can persist it on the chat message.
  onDraftChange: (updated: EmailDraftPayload) => void
  // Callbacks for parent-level side effects (toast, navigation, etc.)
  onSent?: (emailId: string) => void
}

type EditField = null | "recipient" | "subject" | "body"

export function EmailDraftCard({
  messageId,
  initialDraft,
  instruction,
  onDraftChange,
  onSent,
}: EmailDraftCardProps) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<EmailDraftPayload>(initialDraft)
  const [editField, setEditField] = useState<EditField>(null)
  const [recipientInput, setRecipientInput] = useState(draft.recipient)
  const [subjectInput, setSubjectInput] = useState(draft.subject)
  const [bodyInput, setBodyInput] = useState(draft.bodyMarkdown)
  const [sending, setSending] = useState(false)
  const [accounts, setAccounts] = useState<Array<{ id: string; emailAddress: string; displayName: string; connected: boolean; hasOAuthConnection: boolean; hasSmtpPassword: boolean }>>([])
  const [accountId, setAccountId] = useState(draft.accountId ?? "")
  const sendIdempotencyKey = useRef("")
  const [confirmation, setConfirmation] = useState<{ schedule?: string } | null>(null)
  const sendLock = useRef(false)
  useEffect(() => {
    const request = () => setConfirmation({})
    window.addEventListener(`memex:confirm-email:${messageId}`, request)
    return () => window.removeEventListener(`memex:confirm-email:${messageId}`, request)
  }, [messageId])
  const [regenerating, setRegenerating] = useState(false)
  const [showRegenerateBox, setShowRegenerateBox] = useState(false)
  const [feedbackText, setFeedbackText] = useState("")
  const [showScheduleBox, setShowScheduleBox] = useState(false)
  const [scheduleFor, setScheduleFor] = useState("")
  const [autoSubject, setAutoSubject] = useState(false)
  const bodyEditRef = useRef<HTMLTextAreaElement>(null)

  // Keep local draft in sync if the parent passes a new initialDraft
  // (e.g., when regenerating from the server)
  useEffect(() => {
    setDraft(initialDraft)
    setRecipientInput(initialDraft.recipient)
    setSubjectInput(initialDraft.subject)
    setBodyInput(initialDraft.bodyMarkdown)
    setAccountId(initialDraft.accountId ?? "")
  }, [initialDraft])

  // Helper: update draft + notify parent
  const updateDraft = useCallback(
    (updates: Partial<EmailDraftPayload>) => {
      setDraft((prev) => {
        const next = { ...prev, ...updates }
        onDraftChange(next)
        return next
      })
    },
    [onDraftChange]
  )


  useEffect(() => {
    let active = true
    void apiRequest<{ accounts: Array<{ id: string; emailAddress: string; displayName: string; connected: boolean; hasOAuthConnection: boolean; hasSmtpPassword: boolean }> }>("/api/email-accounts")
      .then(({ accounts: loaded }) => {
        if (!active) return
        const sendReady = loaded.filter((account) => account.connected && (account.hasOAuthConnection || account.hasSmtpPassword))
        setAccounts(sendReady)
        if (!draft.accountId && sendReady.length === 1) {
          setAccountId(sendReady[0].id)
          updateDraft({ accountId: sendReady[0].id })
        }
      })
      .catch(() => { if (active) setAccounts([]) })
    return () => { active = false }
  }, [draft.accountId, updateDraft])
  // Helper: append a timeline event
  const addTimelineEvent = useCallback(
    (action: string, details?: string) => {
      const event: EmailTimelineEvent = {
        action,
        timestamp: new Date().toISOString(),
        details,
      }
      setDraft((prev) => {
        const next = { ...prev, timeline: [...prev.timeline, event].slice(-100) }
        onDraftChange(next)
        return next
      })
    },
    [onDraftChange]
  )

  // ── Inline editing handlers ──────────────────────────────────────────────
  const startEdit = (field: EditField) => {
    if (draft.status === "sent" || draft.status === "sending") return
    setEditField(field)
    if (field === "recipient") setRecipientInput(draft.recipient)
    if (field === "subject") setSubjectInput(draft.subject)
    if (field === "body") setBodyInput(draft.bodyMarkdown)
  }

  const saveEdit = (field: EditField) => {
    if (field === "recipient") {
      sendIdempotencyKey.current = ""
      updateDraft({ recipient: recipientInput.trim() || "me" })
      addTimelineEvent("Recipient Selected", recipientInput.trim() || "me")
    } else if (field === "subject") {
      sendIdempotencyKey.current = ""
      updateDraft({ subject: subjectInput.trim() })
      addTimelineEvent("Subject Approved", subjectInput.trim())
    } else if (field === "body") {
      sendIdempotencyKey.current = ""
      updateDraft({ bodyMarkdown: bodyInput })
      addTimelineEvent("Message Edited", `${bodyInput.length} chars`)
      // Auto-update subject from body if enabled and subject wasn't manually customized
      if (autoSubject && bodyInput.trim()) {
        autoUpdateSubject(bodyInput)
      }
    }
    setEditField(null)
  }

  const cancelEdit = () => {
    setEditField(null)
    setRecipientInput(draft.recipient)
    setSubjectInput(draft.subject)
    setBodyInput(draft.bodyMarkdown)
  }

  // Auto-generate subject from body (debounced via a ref to avoid spamming the API)
  const subjectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoUpdateSubject = useCallback((body: string) => {
    if (subjectTimer.current) clearTimeout(subjectTimer.current)
    subjectTimer.current = setTimeout(async () => {
      try {
        const data = await apiRequest<{ subject?: string }>("/api/chat/email-subject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bodyMarkdown: body }),
        })
        const generatedSubject = data.subject
        if (generatedSubject) {
          setDraft((prev) => {
            const next = { ...prev, subject: generatedSubject }
            onDraftChange(next)
            return next
          })
          setSubjectInput(generatedSubject)
        }
      } catch {
        // silent fail — subject auto-update is a nice-to-have
      }
    }, 1200)
  }, [onDraftChange])

  // ── Regenerate draft with feedback ───────────────────────────────────────
  const handleRegenerate = async () => {
    if (!feedbackText.trim()) {
      toast.error("Please describe what to change.")
      return
    }
    setRegenerating(true)
    try {
      const data = await apiRequest<{ draft: EmailDraftPayload }>("/api/chat/email-regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          previousDraft: {
            recipient: draft.recipient,
            subject: draft.subject,
            bodyMarkdown: draft.bodyMarkdown,
            rationale: draft.rationale,
          },
          feedback: feedbackText.trim(),
        }),
      })
      sendIdempotencyKey.current = ""
      const newDraft = data.draft
      const updated: EmailDraftPayload = {
        ...draft,
        recipient: newDraft.recipient,
        subject: newDraft.subject,
        bodyMarkdown: newDraft.bodyMarkdown,
        rationale: newDraft.rationale,
        status: "draft",
        timeline: [
          ...draft.timeline,
          {
            action: "Draft Regenerated",
            timestamp: new Date().toISOString(),
            details: `Feedback: "${feedbackText.trim().slice(0, 80)}"`,
          },
        ],
      }
      setDraft(updated)
      setRecipientInput(newDraft.recipient)
      setSubjectInput(newDraft.subject)
      setBodyInput(newDraft.bodyMarkdown)
      onDraftChange(updated)
      setFeedbackText("")
      setShowRegenerateBox(false)
      toast.success("Draft regenerated", { description: newDraft.rationale })
    } catch (error) {
      toast.error("Regeneration failed", { description: getErrorMessage(error) })
    } finally {
      setRegenerating(false)
    }
  }

  // ── Send the email ───────────────────────────────────────────────────────
  // CRITICAL: this sends ONLY the current draft.recipient, draft.subject,
  // and draft.bodyMarkdown — never chat history, never internal prompts.
  const requestSend = async (schedule?: string) => {
    if (messageId === "streaming" || sending || regenerating || editField || draft.requiresApproval) return
    if (!draft.subject.trim() || !draft.bodyMarkdown.trim()) {
      toast.error("Subject and body are required.")
      return
    }
    if (!accountId) {
      toast.error("Select the sending account before continuing.")
      return
    }
    if (schedule && new Date(schedule).getTime() <= Date.now()) {
      toast.error("Schedule time must be in the future.")
      return
    }

    setSending(true)
    try {
      if (!sendIdempotencyKey.current) sendIdempotencyKey.current = crypto.randomUUID()
      const prepared = await apiRequest<{ id: string; status: string; requiresVerification?: boolean; error?: string }>("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toAddress: draft.recipient,
          subject: draft.subject,
          bodyMarkdown: draft.bodyMarkdown,
          sourceType: "chat",
          sourceId: messageId,
          isAiGenerated: true,
          accountId,
          idempotencyKey: sendIdempotencyKey.current,
          requireVerification: true,
          scheduledFor: schedule ? new Date(schedule).toISOString() : null,
        }),
      })
      if (prepared.status !== "pending_verification") {
        throw new Error(prepared.error || "Email could not be prepared for confirmation.")
      }
      updateDraft({ emailId: prepared.id, accountId, requiresApproval: true, scheduledFor: schedule ? new Date(schedule).toISOString() : undefined, errorMessage: undefined })
      addTimelineEvent("Awaiting Final Confirmation", schedule ? "Scheduled delivery" : "Ready to send")
      setConfirmation({ schedule })
    } catch (error) {
      toast.error("Email could not be prepared", { description: getErrorMessage(error) })
    } finally {
      setSending(false)
    }
  }

  const approveDelivery = async () => {
    if (sendLock.current || !draft.emailId || !draft.requiresApproval) return
    sendLock.current = true
    setSending(true)
    try {
      const data = await apiRequest<{
        id: string
        status: string
        delivered: boolean
        error?: string
      }>("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", id: draft.emailId }),
      })
      setConfirmation(null)
      if (data.status === "scheduled") {
        updateDraft({ status: "scheduled", requiresApproval: false, scheduledFor: draft.scheduledFor })
        addTimelineEvent("Delivery Scheduled", "User confirmed scheduling")
        toast.success("Email scheduled")
      } else if (data.delivered && data.status === "delivered") {
        updateDraft({ status: "sent", requiresApproval: false, errorMessage: undefined })
        addTimelineEvent("Email Sent", `To: ${draft.recipient}`)
        toast.success("Email accepted by the selected provider")
        onSent?.(data.id)
      } else {
        updateDraft({ status: "failed", requiresApproval: false, errorMessage: data.error || "Send failed" })
        addTimelineEvent("Send Failed", data.error || "Unknown error")
        toast.error("Email failed to send", { description: data.error })
      }
      qc.invalidateQueries({ queryKey: ["emails"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
    } catch (error) {
      const message = getErrorMessage(error, "Send failed")
      updateDraft({ status: "failed", requiresApproval: false, errorMessage: message })
      addTimelineEvent("Send Failed", message)
      toast.error("Send failed", { description: message })
    } finally {
      sendLock.current = false
      setSending(false)
    }
  }
  // ── Save as draft (no send) ──────────────────────────────────────────────
  const handleSaveDraft = () => {
    updateDraft({ status: "draft", errorMessage: undefined })
    addTimelineEvent("Draft Saved", "Stored securely with this chat")
    toast.success("Draft saved", {
      description: "It will remain with this chat until you send or cancel it.",
    })
  }

  // ── Cancel ───────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (draft.emailId && draft.requiresApproval) {
      setSending(true)
      try {
        await apiRequest("/api/emails", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", id: draft.emailId }),
        })
      } catch (error) {
        toast.error("Could not cancel the prepared email", { description: getErrorMessage(error) })
        return
      } finally {
        setSending(false)
      }
    }
    updateDraft({ status: "cancelled", requiresApproval: false })
    addTimelineEvent("Draft Cancelled", "User dismissed the draft")
    toast.info("Draft cancelled")
  }

  const isFinal = draft.status === "sent" || draft.status === "cancelled" || draft.status === "scheduled" || Boolean(draft.requiresApproval)
  const isBusy = sending || regenerating || draft.status === "sending" || messageId === "streaming" || editField !== null

  return (
    <Card className="border-primary/30 shadow-sm overflow-hidden">
      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.schedule ? "Schedule this email?" : "Send this email?"}</AlertDialogTitle>
            <AlertDialogDescription>Check the recipient and message before confirming. This action sends a real email.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm min-w-0">
            <p className="break-all"><strong>From:</strong> {accounts.find((account) => account.id === accountId)?.emailAddress || "No account selected"}</p>
            <p className="break-all"><strong>To:</strong> {draft.recipient}</p>
            <p className="break-words"><strong>Subject:</strong> {draft.subject}</p>
            {confirmation?.schedule && <p><strong>Scheduled:</strong> {new Date(confirmation.schedule).toLocaleString()}</p>}
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-t pt-3">{draft.bodyMarkdown}</div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction disabled={isBusy} onClick={() => {
              const schedule = confirmation?.schedule
              setConfirmation(null)
              void approveDelivery()
            }}><Send className="h-4 w-4 mr-2" />{confirmation?.schedule ? "Confirm schedule" : "Confirm send"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CardHeader className="p-3 pb-2 bg-muted/40 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Mail className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                Email Draft
                <Badge variant="secondary" className="text-[9px] h-4 px-1">AI</Badge>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Review · Edit · Send
              </div>
            </div>
          </div>
          <StatusIndicator status={draft.status} />
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-2.5">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">From</label>
          <select
            value={accountId}
            onChange={(event) => {
              const nextAccountId = event.target.value
              setAccountId(nextAccountId)
              sendIdempotencyKey.current = ""
              updateDraft({ accountId: nextAccountId })
            }}
            disabled={isBusy || isFinal}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">{accounts.length ? "Select sending account" : "No sending account connected"}</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName || account.emailAddress} ({account.emailAddress})</option>)}
          </select>
          {!accounts.length && <p className="text-[10px] text-amber-600 dark:text-amber-400">Connect a sending account before confirming delivery.</p>}
        </div>
        {/* Recipient row */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
              Recipient
            </label>
            {!isFinal && editField !== "recipient" && (
              <button
                onClick={() => startEdit("recipient")}
                className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
              >
                <Pencil className="h-2.5 w-2.5" /> Edit
              </button>
            )}
          </div>
          {editField === "recipient" ? (
            <div className="flex items-center gap-1">
              <Input
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                className="h-7 text-xs"
                placeholder="email@example.com or me"
                autoFocus
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit("recipient")}>
                <Check className="h-3 w-3 text-emerald-600" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancelEdit}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="text-xs px-2 py-1 rounded-md bg-muted/40 border border-border">
              {draft.recipient === "me" ? (
                <span className="text-muted-foreground italic">yourself ({draft.recipient})</span>
              ) : (
                <span className="font-mono">{draft.recipient}</span>
              )}
            </div>
          )}
        </div>

        {/* Subject row */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
              Subject
            </label>
            <div className="flex items-center gap-2">
              {!isFinal && editField !== "subject" && (
                <button
                  onClick={() => startEdit("subject")}
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
                >
                  <Pencil className="h-2.5 w-2.5" /> Edit
                </button>
              )}
              {!isFinal && (
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSubject}
                    onChange={(e) => setAutoSubject(e.target.checked)}
                    className="h-2.5 w-2.5"
                  />
                  auto
                </label>
              )}
            </div>
          </div>
          {editField === "subject" ? (
            <div className="flex items-center gap-1">
              <Input
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                className="h-7 text-xs"
                placeholder="Subject line"
                autoFocus
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit("subject")}>
                <Check className="h-3 w-3 text-emerald-600" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancelEdit}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="text-xs font-medium px-2 py-1 rounded-md bg-muted/40 border border-border">
              {draft.subject || <span className="text-muted-foreground italic">(no subject)</span>}
            </div>
          )}
        </div>

        {/* Body row */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
              Body
            </label>
            <div className="flex items-center gap-2">
              {!isFinal && editField !== "body" && (
                <button
                  onClick={() => startEdit("body")}
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
                >
                  <Pencil className="h-2.5 w-2.5" /> Edit
                </button>
              )}
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {draft.bodyMarkdown.length} chars
              </span>
            </div>
          </div>
          {editField === "body" ? (
            <div className="space-y-1">
              <Textarea
                ref={bodyEditRef}
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                className="text-xs font-mono min-h-[180px] resize-y"
                placeholder="Email body in Markdown…"
                autoFocus
              />
              <div className="flex items-center justify-end gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit("body")}>
                  <Check className="h-3 w-3 mr-1" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs px-3 py-2 rounded-md bg-muted/30 border border-border max-h-[280px] overflow-y-auto thin-scroll">
              <MarkdownPreview content={draft.bodyMarkdown} />
            </div>
          )}
        </div>

        {/* Attachments placeholder (no attachment support yet, but the slot is here) */}
        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3 w-3" />
          No attachments
        </div>

        {/* Error display */}
        {draft.status === "failed" && draft.errorMessage && (
          <div className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5 p-2 rounded-md bg-red-500/10 border border-red-500/30">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">Send failed</div>
              <div className="text-[11px] opacity-90">{draft.errorMessage}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px]"
              onClick={() => { void requestSend() }}
              disabled={isBusy}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Retry
            </Button>
          </div>
        )}

        {/* Regenerate box */}
        {showRegenerateBox && !isFinal && (
          <div className="space-y-1.5 p-2 rounded-md bg-primary/5 border border-primary/20">
            <label className="text-[10px] uppercase tracking-wide font-medium text-primary flex items-center gap-1">
              <RefreshCw className="h-2.5 w-2.5" /> Regenerate with feedback
            </label>
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g., make it shorter and more formal, add a meeting time"
              className="text-xs min-h-[60px] resize-none"
              autoFocus
            />
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setShowRegenerateBox(false); setFeedbackText("") }}
                disabled={regenerating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleRegenerate}
                disabled={regenerating || !feedbackText.trim()}
              >
                {regenerating ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Regenerating…</>
                ) : (
                  <><RefreshCw className="h-3 w-3 mr-1" /> Regenerate</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Schedule box */}
        {showScheduleBox && !isFinal && (
          <div className="space-y-1.5 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
            <label className="text-[10px] uppercase tracking-wide font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Schedule send
            </label>
            <Input
              type="datetime-local"
              value={scheduleFor}
              onChange={(e) => setScheduleFor(e.target.value)}
              className="h-7 text-xs"
            />
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setShowScheduleBox(false); setScheduleFor("") }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => { void requestSend(scheduleFor) }}
                disabled={!scheduleFor}
              >
                <Clock className="h-3 w-3 mr-1" /> Schedule
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons — only show for non-final drafts */}
        {!isFinal && (
          <>
            <Separator className="my-1" />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => { void requestSend() }}
                disabled={isBusy}
              >
                {sending ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="h-3 w-3 mr-1" /> Send Email</>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setShowScheduleBox((s) => !s)}
                disabled={isBusy}
              >
                <Clock className="h-3 w-3 mr-1" /> Schedule
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setShowRegenerateBox((s) => !s)}
                disabled={isBusy}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={handleSaveDraft}
                disabled={isBusy}
              >
                <Save className="h-3 w-3 mr-1" /> Save Draft
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { void handleCancel() }}
                disabled={isBusy}
              >
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </>
        )}

        {draft.requiresApproval && draft.emailId && (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
            <p className="text-[11px] text-amber-700 dark:text-amber-300">This email is prepared but cannot leave Memex until you confirm delivery.</p>
            <Button size="sm" className="h-8 text-xs" onClick={() => setConfirmation({})} disabled={isBusy}>
              <Send className="h-3 w-3 mr-1" /> Review and confirm delivery
            </Button>
          </div>
        )}
        {/* Final-state actions */}
        {draft.status === "sent" && (
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span className="flex-1">Email delivered successfully{draft.emailId ? ` · ID ${draft.emailId.slice(-6)}` : ""}</span>
          </div>
        )}
        {draft.status === "saved" && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
            <Save className="h-3 w-3 shrink-0" />
            <span className="flex-1">
              Saved locally, not sent. Connect SMTP and retry to deliver this message.
            </span>
          </div>
        )}
        {draft.status === "scheduled" && draft.scheduledFor && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="flex-1">
              {`Scheduled for ${new Date(draft.scheduledFor).toLocaleString()}`}
            </span>
          </div>
        )}

        {/* Timeline */}
        <EmailTimeline events={draft.timeline} />
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatActionBar — contextual quick-action buttons shown below assistant
// messages that are NOT email drafts (e.g., when discussing an inbox email).
// Lets the user take one-click actions: Reply, Archive, Delete, etc.
// ─────────────────────────────────────────────────────────────────────────────

interface ChatActionBarProps {
  // Optional: the inbox email this message is about (if any)
  emailId?: string
  // Optional: callback when the user clicks "Reply" — opens the email composer
  onReply?: () => void
  // Optional: callback for "Create Task"
  onCreateTask?: () => void
}

export function ChatActionBar({ emailId, onReply, onCreateTask }: ChatActionBarProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const qc = useQueryClient()

  const inboxAction = async (action: string) => {
    if (!emailId) return
    setBusy(action)
    try {
      if (action === "delete") {
        if (!window.confirm("Remove this email from Memex? The provider copy is not deleted.")) return
        await apiRequest(`/api/inbox/${emailId}`, { method: "DELETE" })
      } else {
        // Map UI action to API fields
        const payload: Record<string, boolean | string> = {}
        if (action === "archive") payload.isArchived = true
        else if (action === "star") payload.isStarred = true
        else if (action === "unstar") payload.isStarred = false
        else if (action === "markRead") payload.isRead = true
        else if (action === "markUnread") payload.isRead = false

        await apiRequest(`/api/inbox/${emailId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      qc.invalidateQueries({ queryKey: ["inbox"] })
      const labels: Record<string, string> = {
        archive: "Archived",
        delete: "Deleted",
        star: "Starred",
        unstar: "Unstarred",
        markRead: "Marked as read",
        markUnread: "Marked as unread",
      }
      toast.success(labels[action] || action)
    } catch (error) {
      toast.error("Action failed", { description: getErrorMessage(error) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1">
      {onReply && (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onReply}>
          <Reply className="h-3 w-3 mr-1" /> Reply
        </Button>
      )}
      {emailId && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => inboxAction("archive")}
            disabled={busy !== null}
          >
            {busy === "archive" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Archive className="h-3 w-3 mr-1" />}
            Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => inboxAction("star")}
            disabled={busy !== null}
          >
            {busy === "star" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Star className="h-3 w-3 mr-1" />}
            Mark Important
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10"
            onClick={() => inboxAction("delete")}
            disabled={busy !== null}
          >
            {busy === "delete" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
            Delete
          </Button>
        </>
      )}
      {onCreateTask && (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCreateTask}>
          <ListTodo className="h-3 w-3 mr-1" /> Create Task
        </Button>
      )}

    </div>
  )
}
