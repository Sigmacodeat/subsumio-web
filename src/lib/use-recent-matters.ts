"use client";

import { useCallback, useEffect, useState } from "react";

// Lightweight, client-only tracking of pinned + recently-opened matters (cases).
// Persisted in localStorage so a lawyer's 3–5 active matters are one click away
// on the dashboard. No backend — purely a per-device convenience layer.

const PINNED_KEY = "subsumio:matters:pinned";
const RECENT_KEY = "subsumio:matters:recent";
const MAX_RECENT = 8;
const SYNC_EVENT = "subsumio:matters:changed";

export interface MatterRef {
  slug: string;
  title?: string;
}

// Read list — handles both legacy string[] and new MatterRef[] formats
function readList(key: string): MatterRef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): MatterRef | null => {
        if (typeof item === "string") return { slug: item };
        if (item && typeof item === "object" && typeof item.slug === "string") {
          return {
            slug: item.slug,
            title: typeof item.title === "string" ? item.title : undefined,
          };
        }
        return null;
      })
      .filter((item): item is MatterRef => item !== null);
  } catch {
    return [];
  }
}

function writeList(key: string, list: MatterRef[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {
    // ignore quota / privacy-mode failures — feature is best-effort
  }
}

export function useRecentMatters() {
  const [pinned, setPinned] = useState<MatterRef[]>([]);
  const [recent, setRecent] = useState<MatterRef[]>([]);

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
    const exists = current.find((m) => m.slug === slug);
    const next = exists ? current.filter((m) => m.slug !== slug) : [{ slug }, ...current];
    writeList(PINNED_KEY, next);
  }, []);

  const isPinned = useCallback((slug: string) => pinned.some((m) => m.slug === slug), [pinned]);

  return { pinned, recent, togglePin, isPinned };
}

// Record a visit to a matter. Safe to call from a case detail page effect.
// Pinned matters are excluded from the recent list to avoid duplication.
export function recordMatterVisit(slug: string, title?: string) {
  if (typeof window === "undefined" || !slug) return;
  const pinned = readList(PINNED_KEY);
  const current = readList(RECENT_KEY).filter(
    (m) => m.slug !== slug && !pinned.some((p) => p.slug === slug)
  );
  writeList(RECENT_KEY, [{ slug, title }, ...current].slice(0, MAX_RECENT));
}
