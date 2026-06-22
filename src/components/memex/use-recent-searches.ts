"use client"

import { useState, useCallback } from "react"

// Persist a list of recent search terms in localStorage.
// Deduped + capped at maxItems. Most-recent-first.
export function useRecentSearches(
  storageKey: string,
  maxItems = 8
): {
  recent: string[]
  addSearch: (term: string) => void
  clearSearches: () => void
} {
  // Lazy initializer reads from localStorage once on mount (client-only).
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed.slice(0, maxItems)
      }
    } catch {
      // ignore
    }
    return []
  })

  const addSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (!trimmed) return
      setRecent((prev) => {
        const filtered = prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
        const next = [trimmed, ...filtered].slice(0, maxItems)
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
    },
    [storageKey, maxItems]
  )

  const clearSearches = useCallback(() => {
    setRecent([])
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }, [storageKey])

  return { recent, addSearch, clearSearches }
}

