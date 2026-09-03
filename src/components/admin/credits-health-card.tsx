"use client";

/**
 * CreditsHealthCard — Live Provider-Credits Health Widget.
 *
 * Pollt GET /api/health/credits alle 60s und zeigt:
 * - Status pro Provider (ok / depleted / error / not_configured)
 * - Latency
 * - Fehler-Details
 * - Rotes Banner bei depleted/error
 *
 * Wie OpenAI's "Billing status" Widget im Admin Console.
 * Client Component weil sie periodisch pollt (useQuery).
 */

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, XCircle, HelpCircle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProviderHealth {
  status: "ok" | "depleted" | "error" | "not_configured";
  latencyMs: number | null;
  error?: string;
}

interface CreditsHealthResult {
  providers: Record<string, ProviderHealth>;
  allOk: boolean;
  checkedAt: string;
}

const STATUS_CONFIG: Record<
  ProviderHealth["status"],
  { icon: typeof CheckCircle2; label: string; color: string; bgColor: string; borderColor: string }
> = {
  ok: {
    icon: CheckCircle2,
    label: "OK",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  depleted: {
    icon: AlertCircle,
    label: "Leer",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  error: {
    icon: XCircle,
    label: "Fehler",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  not_configured: {
    icon: HelpCircle,
    label: "Nicht konfiguriert",
    color: "text-[color:var(--ds-text-muted)]",
    bgColor: "bg-[color:var(--ds-surface-2)]",
    borderColor: "border-[color:var(--ds-border)]",
  },
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
};

const PROVIDER_TOPUP_URLS: Record<string, string> = {
  anthropic: "https://console.anthropic.com/settings/billing",
  openrouter: "https://openrouter.ai/settings/credits",
};

export function CreditsHealthCard() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<CreditsHealthResult>({
    queryKey: ["credits-health"],
    queryFn: async () => {
      const res = await fetch("/api/health/credits");
      if (!res.ok && res.status !== 503) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json() as Promise<CreditsHealthResult>;
    },
    refetchInterval: 60_000, // Poll every 60s
    staleTime: 30_000, // Consider stale after 30s
    retry: 1,
  });

  const providers = data?.providers ?? {};
  const providerEntries = Object.entries(providers).sort(([a], [b]) => a.localeCompare(b));
  const hasIssue = data && !data.allOk;
  const checkedAgo = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 1000) : null;

  return (
    <Card className={cn("p-5 transition-colors", hasIssue && "border-red-500/30 bg-red-500/5")}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Provider-Credits</h2>
          {data && (
            <Badge variant={data.allOk ? "success" : "danger"} className="text-xs">
              {data.allOk ? "Alle OK" : "Problem erkannt"}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="h-7 gap-1.5 text-xs"
          aria-label="Aktualisieren"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          {checkedAgo !== null ? `vor ${checkedAgo}s` : "Aktualisieren"}
        </Button>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[color:var(--ds-text-muted)]">
          <RefreshCw size={14} className="animate-spin" />
          Provider werden geprüft…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 py-6 text-sm text-red-600 dark:text-red-400">
          <XCircle size={14} />
          Health-Check fehlgeschlagen. Endpoint nicht erreichbar.
        </div>
      ) : providerEntries.length === 0 ? (
        <div className="py-6 text-sm text-[color:var(--ds-text-muted)]">
          Keine Provider konfiguriert.
        </div>
      ) : (
        <div className="space-y-3">
          {providerEntries.map(([name, health]) => {
            const config = STATUS_CONFIG[health.status];
            const Icon = config.icon;
            const label = PROVIDER_LABELS[name] ?? name;
            const topupUrl = PROVIDER_TOPUP_URLS[name];

            return (
              <div
                key={name}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-3",
                  config.borderColor,
                  config.bgColor
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={16} className={config.color} aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-[color:var(--ds-text)]">{label}</p>
                    {health.error && <p className={cn("text-xs", config.color)}>{health.error}</p>}
                    {health.latencyMs !== null && !health.error && (
                      <p className="text-xs text-[color:var(--ds-text-subtle)]">
                        {health.latencyMs}ms
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-medium", config.color)}>{config.label}</span>
                  {(health.status === "depleted" || health.status === "error") && topupUrl && (
                    <a
                      href={topupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
                    >
                      Aufladen →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasIssue && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">
            <strong>Aktion erforderlich:</strong> Mindestens ein Provider hat keine Credits mehr.
            Pipeline-Runs werden fehlschlagen bis Credits aufgeladen sind. Klicke
            &ldquo;Aufladen&rdquo; beim betroffenen Provider.
          </p>
        </div>
      )}
    </Card>
  );
}
