"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Mail, Send, Sparkles, Clock } from "lucide-react"
import { toast } from "sonner"
import { apiRequest, getErrorMessage } from "@/lib/client-api"
import { useMemex } from "./store"
import type { EmailAccountData, EmailTemplateData } from "./types"

export function EmailComposer() {
  const draft = useMemex((s) => s.emailDraft)
  const close = useMemex((s) => s.closeEmailComposer)
  const qc = useQueryClient()
  const [toAddress, setToAddress] = useState("me")
  const [subject, setSubject] = useState("")
  const [bodyMarkdown, setBodyMarkdown] = useState("")
  const [sourceType, setSourceType] = useState<string>("manual")
  const [sending, setSending] = useState(false)
  const templatesQuery = useQuery<{ templates: EmailTemplateData[] }>({
    queryKey: ["email-templates"],
    queryFn: () => apiRequest("/api/emails/templates"),
  })
  const templates = templatesQuery.data?.templates ?? []
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledFor, setScheduledFor] = useState("")
  const accountsQuery = useQuery<{ accounts: EmailAccountData[] }>({
    queryKey: ["email-accounts"],
    queryFn: () =>
      apiRequest<{ accounts: EmailAccountData[] }>("/api/email-accounts"),
  })
  const hasLiveDelivery = (accountsQuery.data?.accounts ?? []).some(
    (account) =>
      account.connected &&
      ((account.syncMode === "oauth" && account.hasOAuthConnection) ||
        (account.syncMode === "real" && account.hasSmtpPassword))
  )

  useEffect(() => {
    if (draft) {
      setToAddress(draft.toAddress)
      setSubject(draft.subject)
      setBodyMarkdown(draft.bodyMarkdown)
      setSourceType(draft.sourceType)
      setScheduleEnabled(false)
      setScheduledFor("")
    }
  }, [draft])


  if (!draft) return null

  const applyTemplate = (tpl: EmailTemplateData) => {
    setSubject(tpl.subject)
    setBodyMarkdown(tpl.bodyMarkdown)
    setSourceType(tpl.type)
  }

  const handleSend = async () => {
    if (!subject.trim() || !bodyMarkdown.trim()) {
      toast.error("Subject and body are required.")
      return
    }
    if (scheduleEnabled && !scheduledFor) {
      toast.error("Please pick a schedule time, or disable scheduling.")
      return
    }
    if (scheduleEnabled && new Date(scheduledFor).getTime() <= Date.now()) {
      toast.error("Schedule time must be in the future.")
      return
    }
    setSending(true)
    try {
      const data = await apiRequest<{
        requiresVerification?: boolean
        delivered?: boolean
        realSend?: boolean
        deliveryMode?: "smtp" | "oauth" | "local" | "unknown"
      }>("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toAddress,
          subject,
          bodyMarkdown,
          sourceType,
          sourceId: draft.sourceId,
          scheduledFor: scheduleEnabled ? new Date(scheduledFor).toISOString() : null,
          isAiGenerated: sourceType === "chat",
          requireVerification: sourceType === "chat", // AI emails require verification
        }),
      })

      if (data.requiresVerification) {
        toast.info("Verification required", {
          description: "AI-drafted email needs your verification. Go to Sent → Verify tab to approve and send.",
        })
      } else if (scheduleEnabled) {
        toast.success("Email scheduled", {
          description: `For ${new Date(scheduledFor).toLocaleString()}`,
        })
      } else if (data.realSend && data.delivered) {
        toast.success(data.deliveryMode === "oauth" ? "Email accepted by your mail provider" : "Email accepted by SMTP", {
          description: `Sent to ${toAddress === "me" ? "your default recipient" : toAddress}`,
        })
      } else {
        toast.info("Email saved locally", {
          description: "No connected mail provider was available, so the message was not sent.",
        })
      }
      qc.invalidateQueries({ queryKey: ["emails"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      close()
    } catch (error) {
      toast.error(getErrorMessage(error, "Send failed."))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            Compose email
          </DialogTitle>
          <DialogDescription className="sr-only">
            Compose and send an email. Use a template or write from scratch.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Templates */}
          {templatesQuery.isError && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Templates could not be loaded. You can still compose manually.
            </p>
          )}
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Quick templates
              </Label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary hover:bg-accent transition-colors"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email-to" className="text-xs">To</Label>
              <Input
                id="email-to"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="me / you@memex.local"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="chat">Chat answer</SelectItem>
                  <SelectItem value="decision">Decision brief</SelectItem>
                  <SelectItem value="note">Note snapshot</SelectItem>
                  <SelectItem value="digest">Daily digest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-subject" className="text-xs">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body" className="text-xs">
              Body (Markdown)
            </Label>
            <Textarea
              id="email-body"
              value={bodyMarkdown}
              onChange={(e) => setBodyMarkdown(e.target.value)}
              placeholder={"# Heading\n\nWrite your email in **Markdown**…"}
              className="text-sm font-mono min-h-[280px] resize-y"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {sourceType}
            </Badge>
            <span>·</span>
            <span>
              {accountsQuery.isError
                ? "Delivery status unavailable: it will be confirmed after submission"
                : hasLiveDelivery
                  ? "Verified mail-provider delivery available"
                  : "No mail provider: messages save locally"}
            </span>
          </div>

          {/* Scheduling */}
          <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Schedule for later
              </span>
            </label>
            {scheduleEnabled && (
              <div className="flex items-center gap-2 pl-6">
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="text-xs h-8 flex-1"
                />
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {scheduledFor
                    ? new Date(scheduledFor).toLocaleString()
                    : "Pick a time"}
                </span>
              </div>
            )}
            {scheduleEnabled && (
              <p className="text-[10px] text-muted-foreground pl-6">
                Scheduled emails are stored with status &quot;scheduled&quot; and
                delivered when the digest scheduler runs past the chosen time.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border flex-row justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {bodyMarkdown.length} chars
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {scheduleEnabled ? "Scheduling…" : "Sending…"}
                </>
              ) : (
                <>
                  {scheduleEnabled ? (
                    <>
                      <Clock className="h-4 w-4 mr-1" />
                      Schedule email
                    </>
                  ) : (
                    <>
                      {hasLiveDelivery ? (
                        <>
                          <Send className="h-4 w-4 mr-1" />
                          Send email
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-1" />
                          Save locally
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
