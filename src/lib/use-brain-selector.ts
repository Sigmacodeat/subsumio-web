"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface BrainInfo {
  name: string;
  slug: string;
  source: string;
  engine: string;
}

const ACTIVE_BRAIN_KEY = "subsumio:active_brain";

// Topbar and sidebar both mount this hook; share one request per page load.
let brainsInflight: Promise<Response | null> | null = null;
function fetchBrains(): Promise<Response | null> {
  if (!brainsInflight) {
    brainsInflight = fetch("/api/brains")
      .catch(() => null)
      .finally(() => {
        brainsInflight = null;
      });
  }
  return brainsInflight;
}

export function useBrainSelector() {
  const router = useRouter();
  const [brains, setBrains] = useState<BrainInfo[]>([]);
  const [activeBrain, setActiveBrain] = useState<BrainInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchBrains();
        if (res?.ok) {
          const data = await res.clone().json();
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
          const fallback: BrainInfo = {
            name: "Standard",
            slug: "default",
            source: "default",
            engine: "pglite",
          };
          setBrains([fallback]);
          setActiveBrain(fallback);
        }
      } catch {
        const fallback: BrainInfo = {
          name: "Standard",
          slug: "default",
          source: "default",
          engine: "pglite",
        };
        setBrains([fallback]);
        setActiveBrain(fallback);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectBrain = useCallback(
    (brain: BrainInfo) => {
      setActiveBrain(brain);
      localStorage.setItem(ACTIVE_BRAIN_KEY, brain.slug);
      router.refresh();
    },
    [router]
  );

  return { brains, activeBrain, selectBrain, loading };
}
