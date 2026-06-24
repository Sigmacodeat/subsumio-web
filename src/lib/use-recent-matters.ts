"use client";

import { useCallback, useEffect, useState } from "react";

// Lightweight, client-only tracking of pinned + recently-opened matters (cases).
// Persisted in localStorage so a lawyer's 3–5 active matters are one click away
// on the dashboard. No backend — purely a per-device convenience layer.

const PINNED_KEY = "subsumio:matters:pinned";
const RECENT_KEY = "subsumio:matters:recent";
const MAX_RECENT = 8;
const SYNC_EVENT = "subsumio:matters:changed";

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {
    // ignore quota / privacy-mode failures — feature is best-effort
  }
}

export function useRecentMatters() {
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setPinned(readList(PINNED_KEY));
    setRecent(readList(RECENT_KEY));
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(SYNC_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(SYNC_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  const togglePin = useCallback((slug: string) => {
    const current = readList(PINNED_KEY);
    const next = current.includes(slug) ? current.filter((s) => s !== slug) : [slug, ...current];
    writeList(PINNED_KEY, next);
  }, []);

  const isPinned = useCallback((slug: string) => pinned.includes(slug), [pinned]);

  return { pinned, recent, togglePin, isPinned };
}

// Record a visit to a matter. Safe to call from a case detail page effect.
// Pinned matters are excluded from the recent list to avoid duplication.
export function recordMatterVisit(slug: string) {
  if (typeof window === "undefined" || !slug) return;
  const pinned = readList(PINNED_KEY);
  const current = readList(RECENT_KEY).filter((s) => s !== slug && !pinned.includes(slug));
  writeList(RECENT_KEY, [slug, ...current].slice(0, MAX_RECENT));
}
