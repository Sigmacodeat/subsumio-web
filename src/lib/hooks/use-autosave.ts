"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Autosave state machine: idle → dirty → saving → saved/failed.
 *
 * - idle:  nothing unsaved
 * - dirty: user typed, debounce running
 * - saving: write in flight
 * - saved:  server confirmed (timestamp shown to user)
 * - failed: write rejected, will retry on next change or manual trigger
 */
export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";

interface UseAutosaveOptions {
  /** Debounce delay in ms (default 800). */
  delay?: number;
  /** Flush on `visibilitychange` / `beforeunload` (default true). */
  flushOnHide?: boolean;
  /** Only save when this returns true (default always). */
  enabled?: () => boolean;
}

/**
 * Debounced autosave with request dedup via AbortController + sequence
 * numbers. Only the most recent save wins — older in-flight requests are
 * aborted. The local copy is never discarded while a write is outstanding.
 *
 * @param value   The value to save (string, object, …).
 * @param save    Save function. Receives the value and an AbortSignal.
 *                Must throw on non-2xx. Return value is ignored.
 * @param options delay, flushOnHide, enabled.
 *
 * @returns { status, lastSavedAt, saveNow, reset }
 *   - status:       current state machine phase
 *   - lastSavedAt:  Date when the server last confirmed a write
 *   - saveNow:      manually flush (cancels debounce, saves immediately)
 *   - reset:        reset to idle (e.g. after external load)
 */
export function useAutosave<T>(
  value: T,
  save: (value: T, signal: AbortSignal) => Promise<void>,
  options: UseAutosaveOptions = {}
): {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  saveNow: () => Promise<void>;
  reset: () => void;
} {
  const { delay = 800, flushOnHide = true, enabled = () => true } = options;

  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Sequence number — only the latest save's result updates state.
  const seqRef = useRef(0);
  // AbortController for the in-flight save (request dedup).
  const ctrlRef = useRef<AbortController | null>(null);
  // Debounce timer ref.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest value ref (so the flush handler always has the freshest value).
  const valueRef = useRef(value);
  // Whether the current value has been saved at least once.
  const dirtyRef = useRef(false);
  // Stable ref to `save` so we don't re-run the effect on every render.
  const saveRef = useRef(save);
  saveRef.current = save;
  // Stable ref to `enabled`.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  valueRef.current = value;

  const doSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!enabledRef.current()) return;

    // Abort any in-flight save (request dedup — only latest wins).
    ctrlRef.current?.abort();

    const mySeq = ++seqRef.current;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setStatus("saving");

    try {
      await saveRef.current(valueRef.current, ctrl.signal);
      if (mySeq !== seqRef.current) return; // a newer save superseded us
      dirtyRef.current = false;
      setLastSavedAt(new Date());
      setStatus("saved");
    } catch {
      if (ctrl.signal.aborted) return; // aborted by a newer save — not a failure
      if (mySeq !== seqRef.current) return;
      setStatus("failed");
    } finally {
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
    }
  }, []);

  // Debounced save on value change (skips initial mount).
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (!enabledRef.current()) return;
    dirtyRef.current = true;
    setStatus("dirty");

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doSave();
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delay, doSave]);

  // Flush on page hide (beforeunload / visibilitychange).
  useEffect(() => {
    if (!flushOnHide) return;

    const flush = () => {
      if (dirtyRef.current) {
        // Synchronous-ish flush: fire and forget. The page may unload
        // before the request completes, but the request is sent.
        void doSave();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushOnHide, doSave]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      ctrlRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    ctrlRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = false;
    seqRef.current++;
    setStatus("idle");
    setLastSavedAt(null);
  }, []);

  return { status, lastSavedAt, saveNow: doSave, reset };
}
