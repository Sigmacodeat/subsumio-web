"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface OcrStatus {
  enabled: boolean;
  model?: string;
  detail: string;
}

/**
 * P0-4: Shows a warning banner in the dashboard when OCR is inactive.
 * Fetches /api/ocr-status on mount and displays a dismissible amber banner
 * when OCR is disabled, so users know scanned/image-only PDFs won't be
 * text-extracted.
 *
 * The banner is dismissed per-session (sessionStorage) so it doesn't
 * nag users who have consciously decided to leave OCR off.
 */
export function OcrWarningBanner() {
  const [ocrStatus, setOcrStatus] = useState<OcrStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const skipped = sessionStorage.getItem("ocr-warning-dismissed");
      if (skipped === "true") {
        setDismissed(true);
        return;
      }
    } catch {}

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ocr-status");
        if (!res.ok) return;
        const data = (await res.json()) as OcrStatus;
        if (!cancelled) setOcrStatus(data);
      } catch {
        // best effort — don't show banner if we can't check
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !ocrStatus || ocrStatus.enabled) return null;

  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2.5">
      <AlertTriangle size={16} className="shrink-0 text-[color:var(--ds-warning-text)]" />
      <div className="min-w-0 flex-1 text-sm text-[color:var(--ds-text)]">
        <span className="font-medium">OCR inaktiv</span>
        <span className="ml-1.5 text-[color:var(--ds-text-muted)]">
          Gescannte Dokumente und Bilder werden nicht text-extrahiert. Aktiviere{" "}
          <code className="rounded bg-[color:var(--ds-surface-2)] px-1 py-0.5 text-xs text-[color:var(--ds-text)]">
            SUBSUMIO_EMBEDDING_IMAGE_OCR=true
          </code>{" "}
          in der Engine-Konfiguration.
        </span>
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem("ocr-warning-dismissed", "true");
          } catch {}
        }}
        className="shrink-0 rounded p-1 text-[color:var(--ds-warning-text)] transition-colors hover:bg-[color:var(--ds-hover)]"
        aria-label="Warnung verwerfen"
      >
        <X size={14} />
      </button>
    </div>
  );
}
