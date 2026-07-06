"use client";

import { Fragment } from "react";
import { Check, Loader2, Minus } from "lucide-react";

/**
 * Dropbox-style per-file upload lifecycle stepper.
 *
 * Turns the multi-stage backend pipeline (upload → checksum verify → virus scan
 * → extract/index) into a legible visual progression: completed stages get a
 * check, the active stage a spinner, upcoming stages a dimmed dot. This is the
 * UI half of the end-to-end integrity work — the user can SEE the file being
 * verified, scanned and indexed instead of staring at a single opaque bar.
 */

export const UPLOAD_STAGES = [
  { key: "upload", label: "Upload" },
  { key: "verify", label: "Prüfsumme" },
  { key: "scan", label: "Virenscan" },
  { key: "extract", label: "Extrahieren" },
] as const;

export type UploadFileLike = {
  status: "pending" | "preparing" | "uploading" | "processing" | "done" | "error" | "skipped";
  serverPhase?: "downloading" | "verifying" | "scanning" | "extracting";
  /**
   * Whether ANY server sub-phase event (downloading/verifying/scanning/extracting)
   * was ever observed for this file. False on the rare sync-fallback path (Presign/
   * storage unreachable), which reports only a single opaque "processing" phase with
   * no per-stage telemetry. Defaults to true when omitted so existing call sites
   * (which always report a real sub-phase) keep their exact behavior.
   */
  hadSubPhase?: boolean;
  /**
   * True once the pipeline has moved past the "verify" stage (scanning/
   * extracting/done) WITHOUT ever reporting a "verifying" sub-phase — i.e. no
   * client hash was sent (SubtleCrypto/hash-wasm unavailable, non-secure
   * context). Renders stage 1 as neutrally "skipped" instead of falsely
   * implying content integrity was checked.
   */
  verifySkipped?: boolean;
};

/** Sentinel stage meaning "combined processing" — the sync-fallback path has no
 * per-stage telemetry, so stages 1-3 are shown pulsing together rather than
 * falsely freezing on stage 0 until the file is done. */
export const COMBINED_PROCESSING_STAGE = -1;

/**
 * Map a file's status + server sub-phase to the active stage index (0-based).
 * Returns UPLOAD_STAGES.length (== 4) when fully done, so every stage renders
 * as completed. Returns COMBINED_PROCESSING_STAGE for the sync-fallback path,
 * which has no per-stage telemetry to distinguish verify/scan/extract.
 */
export function uploadStageIndex(f: UploadFileLike): number {
  if (f.status === "done") return UPLOAD_STAGES.length;
  if (f.status === "processing") {
    switch (f.serverPhase) {
      case "extracting":
        return 3;
      case "scanning":
        return 2;
      case "verifying":
        return 1;
      case "downloading":
        // Bytes are in storage; the server is fetching them back — still the
        // tail of the "upload" stage from the user's point of view.
        return 0;
      default:
        // No sub-phase ever reported (sync fallback) — show combined progress
        // instead of silently freezing on "Upload" until the file is done.
        return f.hadSubPhase === false ? COMBINED_PROCESSING_STAGE : 0;
    }
  }
  // preparing / uploading / pending
  return 0;
}

export function UploadLifecycle({
  stage,
  verifySkipped = false,
}: {
  stage: number;
  /** Render the "verify" stage as skipped rather than done — see UploadFileLike.verifySkipped. */
  verifySkipped?: boolean;
}) {
  // Sync-fallback path: no per-stage telemetry. Stage 0 (Upload) is done, and
  // stages 1-3 pulse together as one indeterminate "server is processing" group
  // instead of misleadingly freezing on "Upload" until the whole thing finishes.
  const combined = stage === COMBINED_PROCESSING_STAGE;

  return (
    <div className="flex items-center gap-1.5" role="list" aria-label="Verarbeitungsschritte">
      {UPLOAD_STAGES.map((s, i) => {
        const state = combined
          ? i === 0
            ? "done"
            : "pulsing"
          : i === 1 && verifySkipped && i < stage
            ? "skipped"
            : i < stage
              ? "done"
              : i === stage
                ? "active"
                : "upcoming";
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <div
                aria-hidden
                className={`h-px w-3 shrink-0 transition-colors ${
                  combined || i <= stage ? "brand-bg" : "bg-[color:var(--ds-border)]"
                }`}
              />
            )}
            <div
              role="listitem"
              aria-current={state === "active" ? "step" : undefined}
              className="flex items-center gap-1"
            >
              <span
                title={
                  state === "skipped"
                    ? "Prüfsumme übersprungen (kein Client-Hash verfügbar)"
                    : undefined
                }
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  state === "done"
                    ? "brand-bg border-transparent text-white"
                    : state === "active"
                      ? "brand-text brand-border"
                      : state === "pulsing"
                        ? "brand-text brand-border animate-pulse"
                        : state === "skipped"
                          ? "border-[color:var(--ds-border-strong)] text-[color:var(--ds-text-muted)]"
                          : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]"
                }`}
              >
                {state === "done" ? (
                  <Check size={10} strokeWidth={3} />
                ) : state === "active" ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : state === "pulsing" ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                ) : state === "skipped" ? (
                  <Minus size={10} strokeWidth={3} />
                ) : (
                  <span className="h-1 w-1 rounded-full bg-current" aria-hidden />
                )}
              </span>
              <span
                className={`hidden text-[0.6875rem] whitespace-nowrap transition-colors sm:inline ${
                  state === "upcoming" || state === "skipped"
                    ? "text-[color:var(--ds-text-muted)]"
                    : "font-medium text-[color:var(--ds-text)]"
                }`}
              >
                {s.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
