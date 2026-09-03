"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

/**
 * Pipeline-Status-Polling für ein Dokument.
 *
 * Pollt `/api/upload-status/{slug}` in konfigurierbaren Intervallen und
 * stoppt automatisch sobald der Status terminal ist (ready_to_query oder
 * failed). Bei `failed` wird der Fehlercode durchgereicht damit die UI
 * eine aktionsfähige Meldung zeigen kann (z.B. "Passwort eingeben").
 *
 * Verwendung:
 *   const { status, readiness, errorCode } = usePipelineStatus(docSlug);
 *   if (status === "processing") return <Skeleton />;
 *   if (status === "failed" && errorCode === "password_required") return <PasswordPrompt />;
 */
export type PipelineStatus = "processing" | "ready_to_query" | "failed" | "idle";

export interface PipelineStatusResult {
  status: PipelineStatus;
  readiness?: string;
  extractionStatus?: string;
  extractionMethod?: string;
  extractionErrorCode?: string;
  analysisStatus?: string;
  updatedAt?: string;
  error?: string;
}

export interface UsePipelineStatusOptions {
  /** Polling-Intervall in ms (default 2000). */
  intervalMs?: number;
  /** Maximaler Timeout in ms bevor aufgehört wird zu pollen (default 5min). */
  timeoutMs?: number;
  /** Polling stoppen wenn der Tab inaktiv ist (default true). */
  pauseOnHidden?: boolean;
}

function isTerminal(s: PipelineStatus): boolean {
  return s === "ready_to_query" || s === "failed";
}

export function usePipelineStatus(
  slug: string | null | undefined,
  options: UsePipelineStatusOptions = {}
): PipelineStatusResult {
  const { intervalMs = 2000, timeoutMs = 5 * 60_000, pauseOnHidden = true } = options;
  const [result, setResult] = useState<PipelineStatusResult>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const poll = useCallback(async () => {
    if (!slug) return;
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    try {
      const data = await api.upload.status(slug);
      if (ctrl.signal.aborted) return;
      setResult({
        status: data.status,
        readiness: data.readiness,
        extractionStatus: data.extraction_status,
        extractionMethod: data.extraction_method,
        extractionErrorCode: data.extraction_error_code,
        analysisStatus: data.analysis_status,
        updatedAt: data.updated_at,
      });
      if (isTerminal(data.status)) stopRef.current();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setResult({
        status: "failed",
        error: err instanceof Error ? err.message : "poll_failed",
      });
      stopRef.current();
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setResult({ status: "idle" });
      return;
    }
    setResult({ status: "processing" });
    const deadline = Date.now() + timeoutMs;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(id);
      abortRef.current?.abort();
    };
    stopRef.current = stop;
    void poll();
    const id = setInterval(() => {
      if (stopped) return;
      if (Date.now() > deadline) {
        stop();
        return;
      }
      if (pauseOnHidden && document.hidden) return;
      void poll();
    }, intervalMs);
    return () => {
      stop();
      stopRef.current = () => {};
    };
  }, [slug, intervalMs, timeoutMs, pauseOnHidden, poll]);

  return result;
}
