"use client";

/**
 * UploadEstimateBanner — dezente Pre-Upload Kostenschätzung.
 *
 - Wird im Upload-UI eingeblendet wenn Files ausgewählt sind.
 - Schätzt Token-Verbrauch + Credits basierend auf Dateigröße.
 - Goldstandard wie ChatGPT's "Diese Konversation kostet ~X Credits".
 - Dezent: kleine Badge, nicht modal, nicht aufdringlich.
 */

import { useMemo } from "react";
import { Coins, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { usePipelineEstimate } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";

interface UploadEstimateBannerProps {
  /** Anzahl ausgewählter Dateien */
  fileCount: number;
  /** Geschätzte Seitenzahl (aus Dateigrößen oder PDF-Seitenzahl) */
  estimatedPages?: number;
  /** Optional: expliziter Tier (sonst auto-empfehlung) */
  tier?: 1 | 2 | 3;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function UploadEstimateBanner({
  fileCount,
  estimatedPages,
  tier,
}: UploadEstimateBannerProps) {
  // Schätze Pages: ~1 Seite pro 50KB (typisch für PDF/DOCX)
  // Falls estimatedPages explizit gegeben (z.B. aus PDF-Metadaten), nutze das
  const pages = estimatedPages ?? Math.max(fileCount * 10, 1);

  const { data, isLoading } = usePipelineEstimate({ pages, tier });

  const estimate = data?.estimate;

  const display = useMemo(() => {
    if (!estimate) return null;
    return {
      credits: estimate.estimatedCredits,
      tokens: estimate.estimatedInputTokens + estimate.estimatedOutputTokens,
      tier: estimate.tier,
      layerCount: estimate.layerCount,
      sufficient: estimate.sufficient,
      balanceAfter: estimate.balanceAfterPipeline,
    };
  }, [estimate]);

  if (fileCount === 0) return null;

  if (isLoading || !display) {
    return (
      <div
        className="flex animate-pulse items-center gap-2 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)]"
        aria-live="polite"
      >
        <Coins size={12} className="brand-text" aria-hidden />
        <span>Schätze Token-Verbrauch…</span>
      </div>
    );
  }

  const insufficient = !display.sufficient;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs transition-[background-color,border-color] duration-200",
        insufficient
          ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-soft)]"
          : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
      )}
    >
      <div className="flex items-center gap-1.5 font-medium text-[color:var(--ds-text)]">
        {insufficient ? (
          <AlertTriangle size={12} className="text-[color:var(--ds-warning-text)]" aria-hidden />
        ) : (
          <Coins size={12} className="brand-text" aria-hidden />
        )}
        <span>
          Geschätzte Kosten:{" "}
          <span className="font-mono tabular-nums">
            {display.credits.toLocaleString("de-DE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            €
          </span>
        </span>
      </div>

      <span className="text-[color:var(--ds-text-muted)]" aria-hidden>
        ·
      </span>

      <span className="flex items-center gap-1 text-[color:var(--ds-text-muted)]">
        <TrendingUp size={11} aria-hidden />
        <span className="font-mono tabular-nums">{formatTokens(display.tokens)} tokens</span>
      </span>

      <span className="text-[color:var(--ds-text-muted)]" aria-hidden>
        ·
      </span>

      <span className="text-[color:var(--ds-text-muted)]">
        Tier {display.tier} · {display.layerCount} Layer
      </span>

      {insufficient ? (
        <span className="ml-auto flex items-center gap-1 font-medium text-[color:var(--ds-warning-text)]">
          <Info size={11} aria-hidden />
          <a href="/dashboard/billing" className="underline underline-offset-2 hover:no-underline">
            Credits aufladen
          </a>
        </span>
      ) : (
        <span className="ml-auto text-[color:var(--ds-text-subtle)]">
          Rest nach Pipeline:{" "}
          <span className="font-mono tabular-nums">
            {display.balanceAfter.toLocaleString("de-DE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            €
          </span>
        </span>
      )}
    </div>
  );
}
