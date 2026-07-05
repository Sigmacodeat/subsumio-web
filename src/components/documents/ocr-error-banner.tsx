"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, X, Loader2, FileWarning } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { cn } from "@/lib/utils";

interface OcrErrorBannerProps {
  slug: string;
  extractionStatus?: string;
  extractionError?: string;
  extractionErrorCode?: string;
  ocrError?: string;
  onRetried?: () => void;
  className?: string;
}

export function OcrErrorBanner({
  slug,
  extractionStatus,
  extractionError,
  extractionErrorCode,
  ocrError,
  onRetried,
  className,
}: OcrErrorBannerProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isError =
    extractionStatus === "failed" ||
    extractionStatus === "error" ||
    extractionStatus === "ocr_failed";

  const isWarning = extractionStatus === "partial" || extractionStatus === "ocr_needed";

  if (!isError && !isWarning) return null;
  if (dismissed) return null;

  const errorMessage = ocrError || extractionError || undefined;
  const errorCode = extractionErrorCode;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.brain.updatePage({
        slug,
        frontmatter: {
          extraction_status: "ocr_needed",
          ocr_error: undefined,
          ocr_attempted_at: undefined,
          ocr_completed_at: undefined,
        },
      });
      addToast({ type: "success", title: t("ocr.retry_success" as DashboardKey) });
      onRetried?.();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : t("ocr.retry_error" as DashboardKey),
      });
    } finally {
      setRetrying(false);
    }
  };

  const isErrorState = isError;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        isErrorState ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5",
        className
      )}
    >
      <div className="shrink-0">
        {isErrorState ? (
          <AlertTriangle size={18} className="text-red-600" />
        ) : (
          <FileWarning size={18} className="text-amber-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn("text-sm font-medium", isErrorState ? "text-red-700" : "text-amber-700")}
        >
          {isErrorState
            ? t("ocr.error_title" as DashboardKey)
            : t("ocr.warning_title" as DashboardKey)}
        </div>
        {errorMessage && (
          <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{errorMessage}</div>
        )}
        {errorCode && (
          <div className="mt-0.5 font-mono text-xs text-[color:var(--ds-text-subtle)]">
            {errorCode}
          </div>
        )}
        {isErrorState && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t("ocr.retry" as DashboardKey)}
          </button>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
