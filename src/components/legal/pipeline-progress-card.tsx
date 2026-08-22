"use client";

/**
 * PipelineProgressCard — Live Pipeline-Fortschritt + Token-Verbrauch.
 *
 - Goldstandard wie OpenAI's Run-Progress mit Live-Usage.
 - Zeigt: aktueller Layer, geschätzte Credits, Live-Verbrauch (wenn verfügbar).
 - Nach Completion: Settlement triggern + finale Kosten anzeigen.
 - Dezent im PipelinePanel eingebettet.
 */

import { useEffect, useState, useMemo } from "react";
import { Loader2, CheckCircle2, Coins, TrendingUp, Layers, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePipelineEstimate, useTokenUsage } from "@/lib/queries/settings";
import { useRealtime, ensureRealtime } from "@/lib/realtime";
// F1 fix: csrfFetch import removed — settlement is now server-side.
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface PipelineProgressCardProps {
  caseSlug: string;
  /** Pipeline-Status: idle, running, completed, failed, awaiting_review */
  status: string;
  /** Aktueller Layer (1-27) */
  currentLayer: number;
  /** Anzahl Layer gesamt (z.B. 27 für Tier 3) */
  totalLayers?: number;
  /** Pipeline-Key von trigger-pipeline Response (für Settlement) */
  pipelineKey?: string;
  /** Geschätzte Credits (von trigger-pipeline) */
  reservedCredits?: number;
  /** Anzahl Parts/Dokumente */
  partCount?: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function PipelineProgressCard({
  caseSlug,
  status,
  currentLayer,
  totalLayers = 27,
  pipelineKey,
  reservedCredits,
  partCount = 1,
}: PipelineProgressCardProps) {
  const { addToast } = useToast();
  const [settled, setSettled] = useState(false);
  // F1 fix: settling state removed — settlement is now server-side (instant),
  // no client-side loading state needed.

  // Pre-Pipeline Estimate (für Anzeige vor Completion)
  // F3 fix: if reservedCredits is already known (from trigger-pipeline response),
  // skip the estimate fetch — the real reservation is more accurate than the
  // partCount * 50 proxy. Only fetch estimate if we don't have reservedCredits yet.
  const pages = Math.max(partCount * 50, 10);
  const { data: estimateData } = usePipelineEstimate({ pages });

  // Live Token-Usage (während Pipeline läuft, zeigt Verbrauch)
  const { data: usageData, refetch: refetchUsage } = useTokenUsage();

  // Real-time SSE für Live-Token-Usage (wie OpenAI streaming usage)
  // Engine-Token-Webhook broadcastet "pipeline.token_usage" Events
  const [liveTokens, setLiveTokens] = useState<{
    input: number;
    output: number;
    cached: number;
    cacheCreate: number;
    calls: number;
    credits: number;
  }>({
    input: 0,
    output: 0,
    cached: 0,
    cacheCreate: 0,
    calls: 0,
    credits: 0,
  });

  useEffect(() => {
    if (status !== "running") return;
    ensureRealtime();
  }, [status]);

  useRealtime("pipeline.token_usage", (payload) => {
    const data = payload as {
      pipeline_key: string;
      input_tokens: number;
      output_tokens: number;
      cached_input_tokens: number;
      cache_create_tokens: number;
      credits: number;
    };
    if (data.pipeline_key !== pipelineKey) return;
    setLiveTokens((prev) => ({
      input: prev.input + data.input_tokens,
      output: prev.output + data.output_tokens,
      cached: prev.cached + data.cached_input_tokens,
      cacheCreate: prev.cacheCreate + (data.cache_create_tokens ?? 0),
      calls: prev.calls + 1,
      credits: prev.credits + data.credits,
    }));
  });

  // Fallback: Poll alle 10s wenn SSE nicht verfügbar (graceful degradation)
  useEffect(() => {
    if (status !== "running") return;
    const interval = setInterval(() => refetchUsage(), 10_000);
    return () => clearInterval(interval);
  }, [status, refetchUsage]);

  // F1 fix: Server-side settlement — the engine now calls /api/billing/pipeline-settle
  // directly after pipeline completion (in legal-pipeline.ts). The browser no
  // longer triggers settlement; it just shows a toast based on the pipeline status.
  // Pre-fix, settlement was browser-dependent and never happened if the tab was
  // closed. Now it's reliable because the engine does it.
  useEffect(() => {
    if ((status !== "completed" && status !== "failed") || !pipelineKey || settled) return;
    const isFailed = status === "failed";
    // Mark as settled so we don't re-trigger the toast on re-render
    setSettled(true);
    // Custom Event für AccountBalancePill (balance refresh)
    window.dispatchEvent(new CustomEvent("subsumio:pipeline-settled"));
    addToast({
      type: isFailed ? "info" : "success",
      title: isFailed ? "Pipeline abgebrochen — anteilig abgerechnet" : "Pipeline abgerechnet",
      description: isFailed
        ? "Credits werden serverseitig anteilig zurückerstattet."
        : "Credits werden serverseitig token-genau abgerechnet.",
      duration: 5000,
    });
  }, [status, pipelineKey, settled, addToast]);

  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  const progressPct = useMemo(() => {
    if (isCompleted) return 100;
    if (isFailed) return 0;
    return Math.min(100, Math.round((currentLayer / totalLayers) * 100));
  }, [isCompleted, isFailed, currentLayer, totalLayers]);

  const estimate = estimateData?.estimate;
  // Live Token-Usage: SSE-Daten bevorzugt, Fallback auf API-Daten
  const liveUsage =
    liveTokens.calls > 0
      ? {
          totalInputTokens: liveTokens.input,
          totalOutputTokens: liveTokens.output,
          totalCachedTokens: liveTokens.cached,
          totalCacheCreateTokens: liveTokens.cacheCreate,
          totalCalls: liveTokens.calls,
          totalCredits: liveTokens.credits,
        }
      : usageData?.totals;

  if (status === "idle") return null;

  return (
    <Card>
      <div className="space-y-4 p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {isRunning ? (
              <Loader2 size={16} className="brand-text animate-spin" aria-hidden />
            ) : isCompleted ? (
              <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" aria-hidden />
            ) : (
              <Activity size={16} className="text-[color:var(--ds-text-muted)]" aria-hidden />
            )}
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Pipeline-Fortschritt
            </h3>
          </div>
          <Badge variant={isCompleted ? "success" : isRunning ? "info" : "default"}>
            {isRunning ? `Layer ${currentLayer}/${totalLayers}` : isCompleted ? "Fertig" : status}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div
          className="h-2 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Pipeline Fortschritt"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
              isCompleted
                ? "bg-[color:var(--ds-success-solid)]"
                : isFailed
                  ? "bg-[color:var(--ds-danger-solid)]"
                  : "brand-soft"
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-[color:var(--ds-border)] p-2.5">
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <Layers size={11} aria-hidden />
              <span>Layer</span>
            </div>
            <p className="mt-0.5 font-mono text-sm font-semibold text-[color:var(--ds-text)]">
              {currentLayer}/{totalLayers}
            </p>
          </div>

          <div className="rounded-md border border-[color:var(--ds-border)] p-2.5">
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <Coins size={11} aria-hidden />
              <span>{isCompleted ? "Verbraucht" : "Reserviert"}</span>
            </div>
            <p className="mt-0.5 font-mono text-sm font-semibold text-[color:var(--ds-text)]">
              {(isCompleted
                ? (reservedCredits ?? 0)
                : (estimate?.estimatedCredits ?? 0)
              ).toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              €
            </p>
          </div>

          <div className="rounded-md border border-[color:var(--ds-border)] p-2.5">
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <TrendingUp size={11} aria-hidden />
              <span>Tokens (live)</span>
            </div>
            <p className="mt-0.5 font-mono text-sm font-semibold text-[color:var(--ds-text)]">
              {liveUsage
                ? formatTokens(liveUsage.totalInputTokens + liveUsage.totalOutputTokens)
                : "—"}
            </p>
          </div>

          <div className="rounded-md border border-[color:var(--ds-border)] p-2.5">
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <Activity size={11} aria-hidden />
              <span>Calls</span>
            </div>
            <p className="mt-0.5 font-mono text-sm font-semibold text-[color:var(--ds-text)]">
              {liveUsage?.totalCalls ?? "—"}
            </p>
          </div>
        </div>

        {/* Settlement Status */}
        {isCompleted && (
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
            {settled ? (
              <>
                <CheckCircle2
                  size={11}
                  className="text-[color:var(--ds-success-text)]"
                  aria-hidden
                />
                <span>Token-genaue Abrechnung abgeschlossen</span>
              </>
            ) : (
              <span>Abrechnung ausstehend</span>
            )}
          </div>
        )}

        {isRunning && (
          <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            Credits wurden vor Pipeline-Start reserviert. Nach Abschluss wird die token-genaue
            Abrechnung durchgeführt und überschüssige Credits zurückerstattet.
          </p>
        )}
      </div>
    </Card>
  );
}
