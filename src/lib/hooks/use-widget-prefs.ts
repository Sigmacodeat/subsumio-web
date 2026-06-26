"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_WIDGET_PREFS, mergeWithDefaults, type WidgetPref } from "@/lib/widget-registry";
import { csrfFetch } from "@/lib/csrf";

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

  // Guard: once the user has interacted, don't let a late-arriving
  // initial fetch overwrite their changes.
  const userTouched = useRef(false);
  // Debounce timer for server persistence.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Persist prefs to server (debounced). Local state is already updated
   * optimistically — this only syncs to the API.
   */
  const persistToServer = useCallback((widgets: WidgetPref[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      csrfFetch("/api/dashboard/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets }),
      }).catch(() => {});
    }, 400);
  }, []);

  useEffect(() => {
    const local = readLocal();
    if (local) setPrefs(local);

    let cancelled = false;

    csrfFetch("/api/dashboard/widgets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        // Don't overwrite if the user already interacted (race condition guard)
        if (userTouched.current) return;
        if (data?.widgets && Array.isArray(data.widgets)) {
          const merged = mergeWithDefaults(data.widgets);
          setPrefs(merged);
          writeLocal(merged);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    const onChange = () => {
      if (userTouched.current) return;
      const local = readLocal();
      if (local) setPrefs(local);
    };
    window.addEventListener(SYNC_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(SYNC_EVENT, onChange);
      window.removeEventListener("storage", onChange);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const save = useCallback(
    (next: WidgetPref[]) => {
      userTouched.current = true;
      const sorted = [...next].sort((a, b) => a.order - b.order);
      setPrefs(sorted);
      writeLocal(sorted);
      persistToServer(sorted);
    },
    [persistToServer]
  );

  const toggleVisible = useCallback(
    (id: WidgetPref["id"]) => {
      userTouched.current = true;
      setPrefs((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p));
        writeLocal(next);
        persistToServer(next);
        return next;
      });
    },
    [persistToServer]
  );

  const reorder = useCallback(
    (orderedIds: WidgetPref["id"][]) => {
      userTouched.current = true;
      setPrefs((prev) => {
        const next = prev.map((p) => {
          const newOrder = orderedIds.indexOf(p.id);
          return newOrder >= 0 ? { ...p, order: newOrder } : p;
        });
        writeLocal(next);
        persistToServer(next);
        return next;
      });
    },
    [persistToServer]
  );

  const reset = useCallback(() => {
    userTouched.current = true;
    const defaults = [...DEFAULT_WIDGET_PREFS];
    setPrefs(defaults);
    writeLocal(defaults);
    persistToServer(defaults);
  }, [persistToServer]);

  return { prefs, loaded, save, toggleVisible, reorder, reset };
}
