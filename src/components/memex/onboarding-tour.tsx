"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, MessageSquare, FileText, Brain, Mail, Inbox, Shield, Mic, ArrowRight, Check } from "lucide-react"

const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to Memex",
    description: "Your citation-first knowledge assistant. Ask questions about your notes — every answer cites its source. No guessing, no hallucination.",
    color: "text-primary",
  },
  {
    icon: MessageSquare,
    title: "Smart Chat",
    description: "Ask anything — about your notes, about the app, or just say hi. The AI automatically detects what you need and responds appropriately.",
    color: "text-primary",
  },
  {
    icon: FileText,
    title: "Notes — 4 Ways to Add",
    description: "Write manually (with live preview), import from URL, upload files (PDF/Word/PPT), or speak with Audio-to-Note (English & Hindi→Hinglish).",
    color: "text-emerald-500",
  },
  {
    icon: Brain,
    title: "AI Decision Extraction",
    description: "Memex reads your notes and extracts decisions automatically. Browse them in the Decisions section, search by topic, and see related decisions.",
    color: "text-amber-500",
  },
  {
    icon: Inbox,
    title: "Smart Inbox",
    description: "Connect your email. AI categorizes each email (urgent/important/newsletter), writes summaries, and suggests replies. Get a daily briefing.",
    color: "text-blue-500",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "All data is stored locally. Only relevant snippets are sent to AI. You can erase everything anytime. Your notes and emails never leave your device.",
    color: "text-emerald-500",
  },
]

export function OnboardingTour() {
  // Use lazy initializer to check localStorage on mount (client-only)
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      return !localStorage.getItem("memex-onboarding-complete")
    } catch {
      return false
    }
  })
  const [step, setStep] = useState(0)

  // No effect needed — initial state is set via lazy initializer

  const handleClose = () => {
    setOpen(false)
    try {
      localStorage.setItem("memex-onboarding-complete", "true")
    } catch {
      // ignore
    }
  }

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1)
    } else {
      handleClose()
    }
  }

  const handleSkip = () => {
    handleClose()
    setStep(0)
  }

  const current = TOUR_STEPS[step]
  const Icon = current.icon

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Memex Onboarding Tour — Step {step + 1}: {current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Icon className={`h-6 w-6 ${current.color}`} />
          </div>
          <div className="flex-1">
            <Badge variant="outline" className="text-[10px] mb-1">
              {step + 1} / {TOUR_STEPS.length}
            </Badge>
            <h2 className="text-base font-semibold">{current.title}</h2>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {current.description}
        </p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-primary"
                  : i < step
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between items-center">
          <Button variant="ghost" size="sm" className="text-xs" onClick={handleSkip}>
            Skip tour
          </Button>
          <Button size="sm" onClick={handleNext}>
            {step < TOUR_STEPS.length - 1 ? (
              <>
                Next
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 mr-1" />
                Get started
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
