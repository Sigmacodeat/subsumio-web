"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  FileWarning,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

interface PdfViewerProps {
  url: string;
  filename: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PdfViewer({ url, filename, open, onOpenChange }: PdfViewerProps) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      setScale(1.0);
      setPageNum(1);
      setNumPages(0);
    }
  }, [open, url]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
      if (e.key === "ArrowLeft" && pageNum > 1) setPageNum(pageNum - 1);
      if (e.key === "ArrowRight" && pageNum < numPages) setPageNum(pageNum + 1);
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.25, 3.0));
      if (e.key === "-") setScale((s) => Math.max(s - 0.25, 0.5));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, pageNum, numPages, onOpenChange]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  const handleError = useCallback(() => {
    setLoading(false);
    setError("pdf_load_failed");
  }, []);

  if (!open) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via the header close button.
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-[color:var(--ds-surface)] px-4 py-3">
        <span className="flex-1 truncate text-sm font-medium text-[color:var(--ds-text)]">
          {filename}
        </span>

        {/* Page navigation */}
        {numPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPageNum((p) => Math.max(1, p - 1))}
              disabled={pageNum <= 1}
              className="rounded p-1 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)] disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {pageNum} / {numPages}
            </span>
            <button
              onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
              disabled={pageNum >= numPages}
              className="rounded p-1 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)] disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="rounded p-1 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)]"
            title={t("mobile.zoom_out" as DashboardKey)}
          >
            <ZoomOut size={16} />
          </button>
          <span className="w-12 text-center text-xs text-[color:var(--ds-text-muted)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3.0, s + 0.25))}
            className="rounded p-1 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)]"
            title={t("mobile.zoom_in" as DashboardKey)}
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <a
          href={url}
          download={filename}
          className="rounded p-1 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)]"
          title={t("mobile.download" as DashboardKey)}
        >
          <Download size={16} />
        </a>

        <button
          onClick={() => onOpenChange(false)}
          className="rounded p-1 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-2)]"
          title={t("mobile.close" as DashboardKey)}
        >
          <X size={18} />
        </button>
      </div>

      {/* PDF Content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-900">
        {loading && !error && (
          <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
            <Loader2 size={32} className="animate-spin text-[color:var(--ds-text-muted)]" />
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <FileWarning size={48} className="text-[color:var(--ds-text-muted)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("mobile.pdf_error" as DashboardKey)}
            </p>
            <a
              href={url}
              download={filename}
              className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-4 py-2 text-sm text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-surface-2)]"
            >
              <Download size={16} />
              {t("mobile.download_fallback" as DashboardKey)}
            </a>
          </div>
        )}

        {!error && (
          <object
            data={`${url}#page=${pageNum}&zoom=${scale * 100}`}
            type="application/pdf"
            className="h-full w-full"
            onLoad={handleLoad}
            onError={handleError}
            aria-label={filename}
          >
            {/* Fallback for browsers without PDF support */}
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
              <FileWarning size={48} className="text-[color:var(--ds-text-muted)]" />
              <p className="text-center text-sm text-[color:var(--ds-text-muted)]">
                {t("mobile.pdf_not_supported" as DashboardKey)}
              </p>
              <a
                href={url}
                download={filename}
                className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-4 py-2 text-sm text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-surface-2)]"
              >
                <Download size={16} />
                {t("mobile.download_fallback" as DashboardKey)}
              </a>
            </div>
          </object>
        )}
      </div>
    </div>
  );
}
