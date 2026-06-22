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
import { Loader2, Save, User, Mail, Server, Clock } from "lucide-react"
import { toast } from "sonner"
import type { ProfileData } from "./types"

export function Settings() {
  const qc = useQueryClient()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [saving, setSaving] = useState(false)

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
    </div>
  )
}
