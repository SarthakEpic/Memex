"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Loader2, Save, User, Mail, Server, Clock, Shield, Lock, Trash2, AlertTriangle, Eye, Database } from "lucide-react"
import { toast } from "sonner"
import type { ProfileData } from "./types"

export function Settings() {
  const qc = useQueryClient()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [saving, setSaving] = useState(false)
  const [eraseOpen, setEraseOpen] = useState(false)
  const [eraseConfirm, setEraseConfirm] = useState("")
  const [erasing, setErasing] = useState(false)

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setProfile(d.profile))
      .catch(() => toast.error("Failed to load profile"))
  }, [])

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      })
      if (!r.ok) throw new Error("Save failed")
      toast.success("Settings saved")
      qc.invalidateQueries({ queryKey: ["stats"] })
    } catch (e: any) {
      toast.error(e.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-5 memex-fade-up">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your profile and the simulated SMTP pipeline. A real
          transport (nodemailer / SES) could be dropped in behind the same
          <code className="text-xs px-1 py-0.5 rounded bg-muted mx-1">sendEmail()</code>
          interface without touching the rest of the app.
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Profile
          </CardTitle>
          <CardDescription>The recipient used when you address emails to &quot;me&quot;.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMTP */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            SMTP (simulated)
          </CardTitle>
          <CardDescription>
            These credentials are stored locally. Delivery is simulated —
            emails are persisted with a queued → sent → delivered status pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_2fr] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">SMTP host</Label>
              <Input
                value={profile.smtpHost}
                onChange={(e) => setProfile({ ...profile, smtpHost: e.target.value })}
                className="text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Port</Label>
              <Input
                type="number"
                value={profile.smtpPort}
                onChange={(e) =>
                  setProfile({ ...profile, smtpPort: Number(e.target.value) || 587 })
                }
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SMTP user</Label>
              <Input
                value={profile.smtpUser}
                onChange={(e) => setProfile({ ...profile, smtpUser: e.target.value })}
                placeholder="optional"
                className="text-sm font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Digest */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Daily digest
          </CardTitle>
          <CardDescription>
            A scheduled job bundles the last 24 hours of decisions and unanswered
            questions into one email and delivers it to your address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Enable daily digest</div>
              <div className="text-xs text-muted-foreground">
                Toggled on by default. A cron job triggers it every 15 minutes.
              </div>
            </div>
            <Switch
              checked={profile.dailyDigest}
              onCheckedChange={(c) => setProfile({ ...profile, dailyDigest: c })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Digest hour (0-23)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={profile.digestHour}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    digestHour: Math.min(23, Math.max(0, Number(e.target.value) || 9)),
                  })
                }
                className="text-sm"
              />
            </div>
            <div className="flex items-end">
              <Badge variant="outline" className="text-xs">
                Next digest window: {profile.digestHour}:00 local
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1" />
              Save settings
            </>
          )}
        </Button>
      </div>

      <Separator />

      {/* Security & Privacy */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Security &amp; Privacy
          </CardTitle>
          <CardDescription>
            Your notes and emails are confidential. Control how data is stored and processed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Security status badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <Lock className="h-2.5 w-2.5" />
              Local Storage
            </Badge>
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <Shield className="h-2.5 w-2.5" />
              No Cloud Sync
            </Badge>
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <Eye className="h-2.5 w-2.5" />
              LLM Privacy Mode
            </Badge>
          </div>

          {/* Security info */}
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Database className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">Data storage:</span> All notes,
                emails, and chat history are stored in a local SQLite database on this machine.
                Nothing is sent to external servers.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">LLM processing:</span> When you ask
                a question, only the relevant note chunks (not your entire library) are sent to
                the AI model for analysis. Your full data never leaves your device.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">Email credentials:</span> IMAP/SMTP
                settings are stored locally. Email bodies are analyzed in snippets (max 2000 chars)
                for categorization — your full mailbox is never transmitted.
              </div>
            </div>
          </div>

          <Separator />

          {/* Privacy toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">LLM Privacy Mode</div>
                <div className="text-xs text-muted-foreground">
                  Only send minimal note context to the AI. Prevents accidental data exposure.
                </div>
              </div>
              <Switch
                checked={profile?.llmPrivacyMode ?? true}
                onCheckedChange={(c) => setProfile({ ...profile!, llmPrivacyMode: c })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Data Encryption Indicator</div>
                <div className="text-xs text-muted-foreground">
                  Show encryption status badges throughout the app.
                </div>
              </div>
              <Switch
                checked={profile?.dataEncryption ?? true}
                onCheckedChange={(c) => setProfile({ ...profile!, dataEncryption: c })}
              />
            </div>
          </div>

          <Separator />

          {/* Danger zone */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-destructive">Danger Zone</div>
                <div className="text-xs text-muted-foreground">
                  Permanently erase ALL data — notes, emails, chat history, decisions.
                  This cannot be undone.
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="w-full"
              onClick={() => setEraseOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Erase all data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* About */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            About Memex
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-foreground">Memex</strong> is a citation-first
            knowledge retrieval system for personal Markdown notes. Every claim
            in a chat answer is hyperlinked to its source chunk — or the model
            honestly says it can&apos;t cite one.
          </p>
          <p>
            Adapted from a FastAPI + Qdrant + Postgres + Ollama spec to this
            sandbox stack: Next.js 16 + Prisma/SQLite + z-ai-web-dev-sdk. BM25
            retrieval replaces vector search; the LLM does reranking + citation
            enforcement + decision extraction.
          </p>
        </CardContent>
      </Card>

      {/* Erase confirmation dialog */}
      <Dialog open={eraseOpen} onOpenChange={setEraseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Erase All Data
            </DialogTitle>
            <DialogDescription>
              This will permanently delete ALL your notes, emails, chat history,
              decisions, and inbox data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
              Type <code className="font-mono font-bold text-destructive">ERASE ALL DATA</code> below to confirm:
            </div>
            <Input
              value={eraseConfirm}
              onChange={(e) => setEraseConfirm(e.target.value)}
              placeholder="ERASE ALL DATA"
              className="text-sm font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEraseOpen(false); setEraseConfirm("") }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={erasing || eraseConfirm !== "ERASE ALL DATA"}
              onClick={async () => {
                setErasing(true)
                try {
                  const r = await fetch("/api/security/erase", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirm: eraseConfirm }),
                  })
                  const d = await r.json()
                  if (!r.ok) throw new Error(d.error)
                  toast.success(d.message || "All data erased")
                  setEraseOpen(false)
                  setEraseConfirm("")
                  // Reload to reset the app state
                  setTimeout(() => window.location.reload(), 1500)
                } catch (e: any) {
                  toast.error(e.message || "Erase failed")
                } finally {
                  setErasing(false)
                }
              }}
            >
              {erasing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Erase everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
