"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_WIDGET_PREFS, mergeWithDefaults, type WidgetPref } from "@/lib/widget-registry";

const STORAGE_KEY = "subsumio:widget-prefs";
const SYNC_EVENT = "subsumio:widget-prefs:changed";

function readLocal(): WidgetPref[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return mergeWithDefaults(parsed);
  } catch {
    return null;
  }
}

function writeLocal(prefs: WidgetPref[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {}
}

export function useWidgetPrefs() {
  const [prefs, setPrefs] = useState<WidgetPref[]>(DEFAULT_WIDGET_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const local = readLocal();
    if (local) setPrefs(local);

    let cancelled = false;

    fetch("/api/dashboard/widgets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.widgets && Array.isArray(data.widgets)) {
          const merged = mergeWithDefaults(data.widgets);
          setPrefs(merged);
          writeLocal(merged);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    const onChange = () => {
      const local = readLocal();
      if (local) setPrefs(local);
    };
    window.addEventListener(SYNC_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(SYNC_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const save = useCallback(
    (next: WidgetPref[]) => {
      const sorted = [...next].sort((a, b) => a.order - b.order);
      setPrefs(sorted);
      writeLocal(sorted);
      fetch("/api/dashboard/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: sorted }),
      }).catch(() => {});
    },
    []
  );

  const toggleVisible = useCallback(
    (id: WidgetPref["id"]) => {
      setPrefs((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p));
        writeLocal(next);
        fetch("/api/dashboard/widgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgets: next }),
        }).catch(() => {});
        return next;
      });
    },
    []
  );

  const reorder = useCallback(
    (orderedIds: WidgetPref["id"][]) => {
      setPrefs((prev) => {
        const next = prev.map((p) => {
          const newOrder = orderedIds.indexOf(p.id);
          return newOrder >= 0 ? { ...p, order: newOrder } : p;
        });
        writeLocal(next);
        fetch("/api/dashboard/widgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgets: next }),
        }).catch(() => {});
        return next;
      });
    },
    []
  );

  const reset = useCallback(() => {
    const defaults = [...DEFAULT_WIDGET_PREFS];
    setPrefs(defaults);
    writeLocal(defaults);
    fetch("/api/dashboard/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets: defaults }),
    }).catch(() => {});
  }, []);

  return { prefs, loaded, save, toggleVisible, reorder, reset };
}
