"use client";

import { useEffect, useState } from "react";
import { Shield, CheckCircle2, AlertTriangle, XCircle, Loader2, Gauge, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

interface HarnessResult {
  harness_id: string;
  name: string;
  description: string;
  status: "pass" | "warn" | "fail" | "not_run" | "skipped";
  metrics: Record<string, number | string>;
  breaches?: string[];
  blocking?: boolean;
  source?: string;
  last_run?: string;
}

interface EvalGateResult {
  overall_status: "pass" | "warn" | "fail" | "not_run" | "skipped";
  harnesses: HarnessResult[];
  all_breaches: string[];
  gate_passed: boolean;
  evaluated_at: string;
  summary: string;
  aggregated_metrics: Record<string, number | undefined>;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string; labelEn: string }
> = {
  pass: { icon: CheckCircle2, color: "text-emerald-600", label: "Pass", labelEn: "Pass" },
  warn: { icon: AlertTriangle, color: "text-amber-600", label: "Warn", labelEn: "Warning" },
  fail: { icon: XCircle, color: "text-red-600", label: "Fail", labelEn: "Failed" },
  not_run: {
    icon: Clock,
    color: "text-[color:var(--ds-text-subtle)]",
    label: "Not Run",
    labelEn: "Not Run",
  },
  skipped: {
    icon: XCircle,
    color: "text-[color:var(--ds-text-subtle)]",
    label: "Skip",
    labelEn: "Skipped",
  },
};

export function EvalGateWidget() {
  const { lang } = useLang();
  const [result, setResult] = useState<EvalGateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/eval-gate");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setResult(data.data ?? data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Eval gate load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <Loader2 size={16} className="animate-spin text-[color:var(--ds-text-muted)]" />
        <span className="text-sm text-[color:var(--ds-text-muted)]">
          {lang === "en" ? "Loading eval gate..." : "Eval-Gate wird geladen..."}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600">
        <AlertTriangle size={16} />
        {error}
      </div>
    );
  }

  if (!result) return null;

  const overallConfig = STATUS_CONFIG[result.overall_status] ?? STATUS_CONFIG.not_run;
  const OverallIcon = overallConfig.icon;

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[color:var(--ds-text-secondary)]" />
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {lang === "en" ? "Unified Eval Gate" : "Unified Eval Gate"}
          </h3>
        </div>
        <div className={cn("flex items-center gap-1.5", overallConfig.color)}>
          <OverallIcon size={14} />
          <span className="text-xs font-medium">{overallConfig.label}</span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-[color:var(--ds-text-muted)]">{result.summary}</p>

      {/* Aggregated metrics */}
      {Object.keys(result.aggregated_metrics).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(result.aggregated_metrics).map(([key, value]) => {
            if (value === undefined || value === null) return null;
            const displayValue =
              typeof value === "number"
                ? key.includes("rate") ||
                  key.includes("precision") ||
                  key.includes("recall") ||
                  key.includes("f1")
                  ? `${(value * 100).toFixed(1)}%`
                  : value.toString()
                : value;
            return (
              <Badge key={key} variant="default" className="text-[10px]">
                <Gauge size={10} className="mr-1" />
                {key}: {displayValue}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Breaches */}
      {result.all_breaches.length > 0 && (
        <div className="space-y-1 rounded-lg border border-red-500/20 bg-red-500/5 p-2">
          {result.all_breaches.slice(0, 5).map((b, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-600">
              <XCircle size={10} className="mt-0.5 shrink-0" />
              <span>{b}</span>
            </div>
          ))}
          {result.all_breaches.length > 5 && (
            <div className="text-[10px] text-red-600">
              +{result.all_breaches.length - 5} {lang === "en" ? "more" : "weitere"}
            </div>
          )}
        </div>
      )}

      {/* Harness list */}
      <div className="space-y-1.5">
        {result.harnesses.map((h) => {
          const config = STATUS_CONFIG[h.status] ?? STATUS_CONFIG.not_run;
          const Icon = config.icon;
          return (
            <div
              key={h.harness_id}
              className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Icon size={12} className={cn("shrink-0", config.color)} />
                <div>
                  <div className="text-xs font-medium text-[color:var(--ds-text)]">{h.name}</div>
                  {h.blocking && (
                    <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                      {lang === "en" ? "blocking" : "blockierend"}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {Object.entries(h.metrics)
                  .slice(0, 2)
                  .map(([key, value]) => (
                    <span key={key} className="text-[10px] text-[color:var(--ds-text-muted)]">
                      {key}: {String(value)}
                    </span>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timestamp */}
      {result.evaluated_at && (
        <div className="text-[10px] text-[color:var(--ds-text-subtle)]">
          {lang === "en" ? "Evaluated" : "Ausgewertet"}:{" "}
          {new Date(result.evaluated_at).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
        </div>
      )}
    </div>
  );
}
