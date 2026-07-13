"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Gauge,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";

interface SLOStatus {
  workflow: string;
  metric: string;
  current_value: number;
  target: number;
  status: "met" | "breached" | "no_data";
  severity: "critical" | "warning" | "info";
  description: string;
  breached: boolean;
}

interface SLOSummary {
  total: number;
  met: number;
  breached: number;
  no_data: number;
  critical_breaches: number;
}

interface SLOAlert {
  workflow: string;
  metric: string;
  severity: string;
  message: string;
  current_value: number;
  target: number;
}

interface SLOResponse {
  timestamp: string;
  summary: SLOSummary;
  slo_statuses: SLOStatus[];
  alerts: SLOAlert[];
}

const workflowLabels: Record<string, string> = {
  think: "Think",
  subsumption: "Subsumtion",
  legal_pipeline: "Legal Pipeline",
  cross_verify: "Cross-Verify",
  retrieval: "Retrieval",
};

const metricLabels: Record<string, string> = {
  success_rate: "Erfolgsrate",
  verified_rate: "Verifizierungsrate",
  blocked_rate: "Blockrate",
  verifier_error_rate: "Verifier-Fehlerrate",
  stale_source_rate: "Veraltete Quellen",
  retrieval_miss_rate: "Retrieval-Miss-Rate",
  avg_latency_ms: "Ø Latenz (ms)",
  avg_cost_usd: "Ø Kosten (USD)",
  guardrail_pass_rate: "Guardrail-Pass-Rate",
  regeneration_rate: "Regenerationsrate",
  hit_rate: "Hit-Rate",
};

function formatValue(value: number, metric: string): string {
  if (metric.includes("rate") || metric.includes("hit")) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (metric.includes("latency")) {
    return `${Math.round(value)}ms`;
  }
  if (metric.includes("cost")) {
    return `$${value.toFixed(4)}`;
  }
  return value.toFixed(2);
}

function statusIcon(status: string) {
  switch (status) {
    case "met":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "breached":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Activity className="text-muted-foreground h-4 w-4" />;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "met":
      return <Badge className="bg-green-100 text-green-700">Erfüllt</Badge>;
    case "breached":
      return <Badge className="bg-red-100 text-red-700">Verletzt</Badge>;
    default:
      return <Badge variant="default">Keine Daten</Badge>;
  }
}

export default function SLOPage() {
  const { data, isLoading, refetch } = useQuery<SLOResponse>({
    queryKey: ["slo-status"],
    queryFn: async () => {
      const res = await fetch("/api/monitoring/slo");
      if (!res.ok) throw new Error("Failed to fetch SLO status");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const summary = data?.summary;
  const statuses = data?.slo_statuses ?? [];
  const alerts = data?.alerts ?? [];

  const byWorkflow = statuses.reduce<Record<string, SLOStatus[]>>((acc, s) => {
    (acc[s.workflow] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="SLO Monitoring"
        description="Service Level Objectives für alle Workflows — Status, Alerts und Metriken"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin", href: "/dashboard/admin" },
          { label: "SLO" },
        ]}
      />

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Auto-Refresh alle 30s ·{" "}
          {data ? `Aktualisiert: ${new Date(data.timestamp).toLocaleTimeString("de-AT")}` : "Lädt…"}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Gauge className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{summary?.total ?? "—"}</p>
              <p className="text-muted-foreground text-xs">SLOs gesamt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{summary?.met ?? "—"}</p>
              <p className="text-muted-foreground text-xs">Erfüllt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{summary?.breached ?? "—"}</p>
              <p className="text-muted-foreground text-xs">Verletzt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{summary?.critical_breaches ?? "—"}</p>
              <p className="text-muted-foreground text-xs">Kritische Verletzungen</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Aktive Alerts ({alerts.length})
            </h3>
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        alert.severity === "critical"
                          ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                      }
                    >
                      {alert.severity}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        {workflowLabels[alert.workflow] ?? alert.workflow} —{" "}
                        {metricLabels[alert.metric] ?? alert.metric}
                      </p>
                      <p className="text-muted-foreground text-xs">{alert.message}</p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-mono">
                      {formatValue(alert.current_value, alert.metric)} /{" "}
                      {formatValue(alert.target, alert.metric)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SLO Status by Workflow */}
      <div className="space-y-4">
        {Object.entries(byWorkflow).map(([workflow, slos]) => (
          <Card key={workflow}>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">{workflowLabels[workflow] ?? workflow}</h3>
              <div className="space-y-2">
                {slos.map((slo, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      {statusIcon(slo.status)}
                      <div>
                        <p className="text-sm font-medium">
                          {metricLabels[slo.metric] ?? slo.metric}
                        </p>
                        <p className="text-muted-foreground text-xs">{slo.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {slo.status === "met" ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : slo.status === "breached" ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : null}
                      <span className="font-mono text-sm">
                        {slo.status === "no_data"
                          ? "—"
                          : formatValue(slo.current_value, slo.metric)}
                        <span className="text-muted-foreground">
                          {" / "}
                          {formatValue(slo.target, slo.metric)}
                        </span>
                      </span>
                      {statusBadge(slo.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {statuses.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="text-muted-foreground mx-auto mb-3 h-12 w-12" />
            <p className="text-muted-foreground text-sm">
              Keine SLO-Daten verfügbar. Metriken werden gesammelt, sobald Workflows ausgeführt
              werden.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
