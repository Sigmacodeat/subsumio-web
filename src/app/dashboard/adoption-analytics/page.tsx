"use client";

import { useState } from "react";
import {
  BarChart3,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Activity,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { useApiQuery } from "@/lib/use-api-query";

interface UserUsage {
  user_id: string;
  user_name: string;
  role: string;
  total_requests: number;
  queries: number;
  documents_analyzed: number;
  contracts_reviewed: number;
  agents_run: number;
  last_active: string;
}

interface FeatureUsage {
  feature: string;
  count: number;
  unique_users: number;
  trend: "up" | "down" | "stable";
}

interface UsageTrend {
  date: string;
  total_requests: number;
  unique_users: number;
  queries: number;
  analyses: number;
}

interface AdoptionAnalytics {
  total_users: number;
  active_users_30d: number;
  active_users_7d: number;
  total_requests_30d: number;
  avg_requests_per_user: number;
  top_features: FeatureUsage[];
  user_breakdown: UserUsage[];
  usage_trends: UsageTrend[];
  adoption_rate: number;
  warnings: string[];
  generated_at: string;
}

const TREND_ICONS: Record<string, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const TREND_COLORS: Record<string, string> = {
  up: "text-emerald-600 bg-emerald-500/10",
  down: "text-red-600 bg-red-500/10",
  stable: "text-gray-500 bg-gray-500/10",
};

const FEATURE_LABELS: Record<string, string> = {
  query: "KI-Chat / Rechtsfragen",
  legal: "Legal AI (Analyse, Review, Drafting)",
  agent: "Workflow Agents",
  case: "Fallmanagement",
  document: "Dokumente / Vault",
  deadline: "Fristen & Deadlines",
  invoice: "Rechnung & Billing",
  settings: "Einstellungen",
  auth: "Authentifizierung",
  portal: "Mandantenportal",
  email: "E-Mail",
  whatsapp: "WhatsApp",
  bea: "beA Anwaltspostfach",
  docusign: "DocuSign",
  cron: "Automatisierte Jobs",
  search: "Suche",
  graph: "Wissensgraph",
  upload: "Dokument-Upload",
  export: "Export",
  conflict: "Kollisionsprüfung",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "heute";
    if (days === 1) return "gestern";
    if (days < 7) return `vor ${days} Tagen`;
    if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
    return `vor ${Math.floor(days / 30)} Monaten`;
  } catch {
    return iso;
  }
}

export default function AdoptionAnalyticsPage() {
  const { t: _t } = useLang();
  const [daysBack, setDaysBack] = useState(30);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiQuery<AdoptionAnalytics>(async () => {
    const res = await fetch(`/api/analytics/adoption?daysBack=${daysBack}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AdoptionAnalytics;
  }, [daysBack]);

  const maxRequests =
    data && data.usage_trends.length > 0
      ? Math.max(...data.usage_trends.map((t) => t.total_requests))
      : 1;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Adoption Analytics"
        description="Platform-Nutzung: Wer nutzt was, wie oft und woran — das Subsumio Command Center"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Adoption Analytics" }]}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={daysBack}
              onChange={(e) => setDaysBack(Number(e.target.value))}
              className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-1.5 text-sm"
            >
              <option value={7}>7 Tage</option>
              <option value={30}>30 Tage</option>
              <option value={90}>90 Tage</option>
              <option value={180}>180 Tage</option>
              <option value={365}>365 Tage</option>
            </select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Aktualisieren
            </Button>
          </div>
        }
      />

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Fehler beim Laden</span>
          </div>
          <p className="mt-1 text-sm text-red-600/80">{error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Warnings */}
          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Hinweise</span>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-amber-600/80">
                {data.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPICard
              icon={Users}
              label="Aktive Nutzer (30d)"
              value={data.active_users_30d}
              sub={`${data.active_users_7d} in 7 Tagen`}
              color={data.active_users_30d > 0 ? "text-emerald-600" : "text-red-600"}
            />
            <KPICard
              icon={Activity}
              label="Anfragen (30d)"
              value={data.total_requests_30d}
              sub={`Ø ${data.avg_requests_per_user}/Nutzer`}
            />
            <KPICard
              icon={BarChart3}
              label="Adoption Rate"
              value={`${data.adoption_rate}%`}
              sub={`${data.active_users_30d} von ${data.total_users}`}
              color={
                data.adoption_rate >= 50
                  ? "text-emerald-600"
                  : data.adoption_rate >= 25
                    ? "text-amber-600"
                    : "text-red-600"
              }
            />
            <KPICard
              icon={Clock}
              label="Gesamtnutzer"
              value={data.total_users}
              sub="Letzte 365 Tage"
            />
          </div>

          {/* Usage Trends Chart */}
          {data.usage_trends.length > 0 && (
            <Card className="p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="h-5 w-5" />
                Nutzungs-Trend ({data.usage_trends.length} Tage)
              </h3>
              <div className="flex h-48 items-end gap-1">
                {data.usage_trends
                  .slice()
                  .reverse()
                  .map((t, i) => {
                    const heightPct = (t.total_requests / maxRequests) * 100;
                    return (
                      <div
                        key={i}
                        className="group relative flex min-w-[4px] flex-1 flex-col items-center justify-end"
                        title={`${formatDate(t.date)}: ${t.total_requests} Anfragen, ${t.unique_users} Nutzer`}
                      >
                        <div
                          className="bg-brand hover:bg-brand/80 w-full rounded-t transition-all"
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                        />
                        {i % Math.ceil(data.usage_trends.length / 12) === 0 && (
                          <span className="mt-1 origin-left rotate-45 text-[10px] whitespace-nowrap text-[color:var(--ds-text-muted)]">
                            {formatDate(t.date).slice(0, 5)}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                <span>Anfragen/Tag</span>
                <span>Max: {maxRequests}</span>
              </div>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top Features */}
            <Card className="p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <BarChart3 className="h-5 w-5" />
                Feature-Nutzung
              </h3>
              {data.top_features.length === 0 ? (
                <p className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
                  Keine Nutzungsdaten verfügbar
                </p>
              ) : (
                <div className="space-y-2">
                  {data.top_features.map((f, i) => {
                    const TrendIcon = TREND_ICONS[f.trend] ?? Minus;
                    const label = FEATURE_LABELS[f.feature] ?? f.feature;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border border-[color:var(--ds-border)] px-3 py-2"
                      >
                        <div className="flex-1 truncate">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
                            {f.count}× · {f.unique_users} Nutzer
                          </span>
                        </div>
                        <div
                          className={cn(
                            "ml-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            TREND_COLORS[f.trend]
                          )}
                        >
                          <TrendIcon className="h-3 w-3" />
                          {f.trend === "up"
                            ? "Steigend"
                            : f.trend === "down"
                              ? "Fallend"
                              : "Stabil"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* User Breakdown */}
            <Card className="p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Users className="h-5 w-5" />
                Nutzer-Übersicht
              </h3>
              {data.user_breakdown.length === 0 ? (
                <p className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
                  Keine Nutzer-Daten verfügbar
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {data.user_breakdown.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border border-[color:var(--ds-border)] px-3 py-2"
                    >
                      <div className="flex-1 truncate">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {u.user_name || u.user_id}
                          </span>
                          {u.role && (
                            <Badge variant="default" className="text-xs">
                              {u.role}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                          <span>{u.total_requests} Anfragen</span>
                          {u.queries > 0 && <span>{u.queries} Queries</span>}
                          {u.documents_analyzed > 0 && <span>{u.documents_analyzed} Analysen</span>}
                          {u.contracts_reviewed > 0 && <span>{u.contracts_reviewed} Verträge</span>}
                          {u.agents_run > 0 && <span>{u.agents_run} Agents</span>}
                        </div>
                      </div>
                      <span className="ml-2 shrink-0 text-xs text-[color:var(--ds-text-muted)]">
                        {formatRelative(u.last_active)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Generated timestamp */}
          <div className="text-center text-xs text-[color:var(--ds-text-muted)]">
            Generiert: {new Date(data.generated_at).toLocaleString("de-DE")}
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[color:var(--ds-text-muted)]">{label}</p>
          <p className={cn("text-2xl font-bold", color)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{sub}</p>}
        </div>
        <Icon className="h-8 w-8 text-[color:var(--ds-text-muted)]" />
      </div>
    </Card>
  );
}
