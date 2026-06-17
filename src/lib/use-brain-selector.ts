"use client";

import { useState, useEffect, useCallback } from "react";

export interface BrainInfo {
  name: string;
  slug: string;
  source: string;
  engine: string;
}

const ACTIVE_BRAIN_KEY = "sigmabrain:active_brain";

export function useBrainSelector() {
  const [brains, setBrains] = useState<BrainInfo[]>([]);
  const [activeBrain, setActiveBrain] = useState<BrainInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch brains from API or local config
        const res = await fetch("/api/brains").catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const list = (data.brains || []) as BrainInfo[];
          setBrains(list);
          const saved = localStorage.getItem(ACTIVE_BRAIN_KEY);
          if (saved) {
            const found = list.find((b) => b.slug === saved);
            if (found) setActiveBrain(found);
          } else if (list.length > 0) {
            setActiveBrain(list[0]);
          }
        } else {
          // Fallback: single default brain
          const fallback: BrainInfo = { name: "Standard", slug: "default", source: "default", engine: "pglite" };
          setBrains([fallback]);
          setActiveBrain(fallback);
        }
      } catch {
        const fallback: BrainInfo = { name: "Standard", slug: "default", source: "default", engine: "pglite" };
        setBrains([fallback]);
        setActiveBrain(fallback);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectBrain = useCallback((brain: BrainInfo) => {
    setActiveBrain(brain);
    localStorage.setItem(ACTIVE_BRAIN_KEY, brain.slug);
    // Reload to apply brain context
    window.location.reload();
  }, []);

  return { brains, activeBrain, selectBrain, loading };
}
