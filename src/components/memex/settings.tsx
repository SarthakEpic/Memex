"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Bell,
  BellOff,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  Inbox,
  Loader2,
  Lock,
  Mail,
  Save,
  Server,
  Shield,
  Trash2,
  User,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { apiRequest, getErrorMessage } from "@/lib/client-api"
import { SectionError } from "./section-state"
import { useMemex } from "./store"
import type { EmailAccountData, ProfileData } from "./types"

interface AiStatus {
  provider: string
  providerName: string
  model: string
  configured: boolean
  missingEnvVar?: string
}

export function Settings() {
  const queryClient = useQueryClient()
  const setSection = useMemex((state) => state.setSection)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [saving, setSaving] = useState(false)
  const [eraseOpen, setEraseOpen] = useState(false)
  const [eraseConfirm, setEraseConfirm] = useState("")
  const [erasing, setErasing] = useState(false)

  const profileQuery = useQuery<{ profile: ProfileData }>({
    queryKey: ["profile"],
    queryFn: () => apiRequest<{ profile: ProfileData }>("/api/profile"),
  })

  useEffect(() => {
    if (profileQuery.data?.profile) {
      setProfile(profileQuery.data.profile)
    }
  }, [profileQuery.data])

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const result = await apiRequest<{ profile: ProfileData }>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          dailyDigest: profile.dailyDigest,
          digestHour: profile.digestHour,
          llmPrivacyMode: profile.llmPrivacyMode,
        }),
      })
      setProfile(result.profile)
      toast.success("Settings saved")
      void queryClient.invalidateQueries({ queryKey: ["profile"] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })
    } catch (error) {
      toast.error(getErrorMessage(error, "Settings could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  if (profileQuery.error) {
    return (
      <SectionError
        title="Settings could not be loaded"
        error={profileQuery.error}
        onRetry={() => void profileQuery.refetch()}
      />
    )
  }

  if (profileQuery.isLoading || !profile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 memex-fade-up">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, delivery connections, scheduled digest, and data handling.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-primary" />
            Profile
          </CardTitle>
          <CardDescription>
            The default identity and recipient used by workspace email actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="profile-name" className="text-xs">Name</Label>
            <Input
              id="profile-name"
              value={profile.name}
              onChange={(event) =>
                setProfile({ ...profile, name: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="profile-email" className="text-xs">Default recipient email</Label>
            <Input
              id="profile-email"
              type="email"
              value={profile.email}
              onChange={(event) =>
                setProfile({ ...profile, email: event.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

      <EmailDeliveryCard onOpenInbox={() => setSection("inbox")} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            Daily digest
          </CardTitle>
          <CardDescription>
            Bundles recent decisions and questions into an email at your chosen hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Enable daily digest</div>
              <div className="text-xs text-muted-foreground">
                Production checks run every 10 minutes; local delivery also runs while Memex is open.
              </div>
            </div>
            <Switch
              checked={profile.dailyDigest}
              onCheckedChange={(checked) =>
                setProfile({ ...profile, dailyDigest: checked })
              }
              aria-label="Enable daily digest"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="digest-hour" className="text-xs">Digest hour (0-23)</Label>
              <Input
                id="digest-hour"
                type="number"
                min={0}
                max={23}
                value={profile.digestHour}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    digestHour: Math.min(
                      23,
                      Math.max(0, Number(event.target.value) || 0)
                    ),
                  })
                }
              />
            </div>
            <div className="flex items-end">
              <Badge variant="outline" className="text-xs">
                Delivery window: {String(profile.digestHour).padStart(2, "0")}:00 local
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Save settings
        </Button>
      </div>

      <Separator />

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-primary" />
            Security and privacy
          </CardTitle>
          <CardDescription>
            What Memex protects locally and what leaves the server for AI processing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <Shield className="h-2.5 w-2.5" />
              Account-scoped access
            </Badge>
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <Lock className="h-2.5 w-2.5" />
              Encrypted mail credentials
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Bot className="h-2.5 w-2.5" />
              External AI processing
            </Badge>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <DataDisclosure
              icon={Database}
              title="Workspace storage"
              body="Local development uses SQLite; online deployment uses your configured database. Records are isolated by user account. Note and email content is not field-encrypted, so database access and backups must remain restricted."
            />
            <DataDisclosure
              icon={Bot}
              title="AI context"
              body="Chat sends retrieved note chunks, not your full library. Inbox analysis sends sender, subject, and up to 2,000 characters of an email body to the configured AI provider. Provider retention settings apply."
            />
            <DataDisclosure
              icon={Lock}
              title="Email credentials"
              body="OAuth refresh tokens and advanced IMAP/SMTP secrets are encrypted with AES-GCM before database storage and are never returned by the account API."
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Minimal AI context</div>
              <div className="text-xs text-muted-foreground">
                Limit note Q&A to the three highest-ranked chunks instead of six.
              </div>
            </div>
            <Switch
              checked={profile.llmPrivacyMode}
              onCheckedChange={(checked) =>
                setProfile({ ...profile, llmPrivacyMode: checked })
              }
              aria-label="Use minimal AI context"
            />
          </div>
        </CardContent>
      </Card>

      <NotificationCard />
      <AiProviderCard />

      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently erase this account&apos;s notes, email data, chat history, and decisions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full" onClick={() => setEraseOpen(true)}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Erase workspace data
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            About Memex
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs leading-relaxed text-muted-foreground">
          Memex is a source-backed workspace for notes, decisions, chat, and email.
          Chat answers link to retrieved note chunks; AI-generated email requires human review.
        </CardContent>
      </Card>

      <Dialog open={eraseOpen} onOpenChange={setEraseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Erase workspace data
            </DialogTitle>
            <DialogDescription>
              This permanently deletes data owned by your account. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
              Type <code className="font-mono font-bold text-destructive">ERASE ALL DATA</code> to confirm.
            </div>
            <Input
              value={eraseConfirm}
              onChange={(event) => setEraseConfirm(event.target.value)}
              placeholder="ERASE ALL DATA"
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEraseOpen(false)
                setEraseConfirm("")
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={erasing || eraseConfirm !== "ERASE ALL DATA"}
              onClick={async () => {
                setErasing(true)
                try {
                  const result = await apiRequest<{ message?: string }>(
                    "/api/security/erase",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ confirm: eraseConfirm }),
                    }
                  )
                  toast.success(result.message || "Workspace data erased")
                  setEraseOpen(false)
                  setEraseConfirm("")
                  await queryClient.clear()
                  window.location.reload()
                } catch (error) {
                  toast.error(getErrorMessage(error, "Erase failed."))
                } finally {
                  setErasing(false)
                }
              }}
            >
              {erasing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Erase everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmailDeliveryCard({ onOpenInbox }: { onOpenInbox: () => void }) {
  const accountsQuery = useQuery<{ accounts: EmailAccountData[] }>({
    queryKey: ["email-accounts"],
    queryFn: () =>
      apiRequest<{ accounts: EmailAccountData[] }>("/api/email-accounts"),
  })
  const accounts = accountsQuery.data?.accounts ?? []
  const liveAccounts = accounts.filter(
    (account) =>
      account.connected &&
      ((account.syncMode === "oauth" && account.hasOAuthConnection) ||
        (account.syncMode === "real" && account.hasSmtpPassword))
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Server className="h-4 w-4 text-primary" />
          Email delivery
        </CardTitle>
        <CardDescription>
          Real sending requires a connected Google, Microsoft, or verified advanced IMAP/SMTP account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {accountsQuery.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : liveAccounts.length > 0 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <Inbox className="h-4 w-4 text-amber-500" />
          )}
          <div>
            <p className="text-sm font-medium">
              {liveAccounts.length > 0
                ? `${liveAccounts.length} delivery-ready account${liveAccounts.length === 1 ? "" : "s"}`
                : "Local save only"}
            </p>
            <p className="text-xs text-muted-foreground">
              {liveAccounts.length > 0
                ? liveAccounts.map((account) => account.emailAddress).join(", ")
                : "Messages are saved but never marked delivered without a connected mail provider."}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onOpenInbox}>
          Manage
        </Button>
      </CardContent>
    </Card>
  )
}

function NotificationCard() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  )

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unsupported")
  }, [])

  const enabled = permission === "granted"
  const denied = permission === "denied"

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-primary" />}
          Urgent email notifications
        </CardTitle>
        <CardDescription>
          Browser alerts are checked while Memex is open and require your permission.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            {enabled ? "Enabled" : denied ? "Blocked by browser" : permission === "default" ? "Not enabled" : "Not supported"}
          </p>
          <p className="text-xs text-muted-foreground">
            {denied
              ? "Re-enable notifications in your browser site settings."
              : enabled
                ? "Only newly detected urgent unread messages trigger an alert."
                : "Memex will not ask until you click Enable."}
          </p>
        </div>
        {permission === "default" && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => setPermission(await Notification.requestPermission())}
          >
            Enable
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function AiProviderCard() {
  const statusQuery = useQuery<AiStatus>({
    queryKey: ["ai-status"],
    queryFn: () => apiRequest<AiStatus>("/api/ai-status"),
  })

  if (statusQuery.error) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-destructive">
          AI status could not be checked. {getErrorMessage(statusQuery.error, "Try again.")}
        </CardContent>
      </Card>
    )
  }

  if (!statusQuery.data) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          Checking AI provider status
        </CardContent>
      </Card>
    )
  }

  const status = statusQuery.data
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="h-4 w-4 text-primary" />
          AI provider
        </CardTitle>
        <CardDescription>
          Used for chat, decision extraction, email drafting, and inbox analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{status.providerName}</Badge>
          <code className="text-xs text-muted-foreground">{status.model}</code>
          <Badge
            variant="outline"
            className={
              status.configured
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }
          >
            {status.configured ? "Ready" : "Not configured"}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {status.configured
            ? "Memex can reach the configured provider. Retention and training controls must also be configured in that provider account."
            : `Set ${status.missingEnvVar || "the provider API key"} in the server environment, then restart Memex.`}
        </p>
      </CardContent>
    </Card>
  )
}

function DataDisclosure({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType
  title: string
  body: string
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <p>
        <span className="font-medium text-foreground">{title}:</span> {body}
      </p>
    </div>
  )
}