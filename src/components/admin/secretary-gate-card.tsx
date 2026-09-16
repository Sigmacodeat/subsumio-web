"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/use-lang";

interface SecretaryMetrics {
  sent: number;
  blocked: number;
  deliveryRate: number;
  templateWindowViolations: number;
  consentViolations: number;
  consentComplianceRate: number | null;
  proactivePrecision: { rated: number; useful: number; precision: number } | null;
  gatePass: boolean;
}

interface MetricsResponse {
  windowDays: number;
  since: string;
  metrics: SecretaryMetrics;
}

async function loadSecretaryMetrics(): Promise<MetricsResponse> {
  const res = await fetch("/api/legal/secretary-metrics?days=30", {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("secretary_metrics_unavailable");
  return (await res.json()) as MetricsResponse;
}

export function SecretaryGateCard() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const query = useQuery({
    queryKey: ["secretary-metrics", 30],
    queryFn: loadSecretaryMetrics,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (query.isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }
  if (query.isError) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4 text-sm text-[color:var(--ds-warning-text)]"
        role="status"
      >
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          {isEn
            ? "Secretary metrics currently unavailable."
            : "Sekretariats-Metriken aktuell nicht verfügbar."}
        </span>
      </div>
    );
  }

  const m = query.data?.metrics;
  if (!m) return null;

  const stats = [
    {
      label: isEn ? "Sent (30d)" : "Gesendet (30T)",
      value: m.sent,
      tone: "default" as const,
    },
    {
      label: isEn ? "Delivery rate" : "Zustellrate",
      value: `${Math.round(m.deliveryRate * 100)}%`,
      tone: m.deliveryRate >= 0.9 ? ("success" as const) : ("warning" as const),
    },
    {
      label: isEn ? "Consent compliance" : "Consent-Compliance",
      value:
        m.consentComplianceRate === null ? "—" : `${Math.round(m.consentComplianceRate * 100)}%`,
      tone:
        m.consentComplianceRate === null
          ? ("default" as const)
          : m.consentComplianceRate >= 0.99
            ? ("success" as const)
            : ("danger" as const),
    },
    {
      label: isEn ? "Window violations" : "Fenster-Verstöße",
      value: m.templateWindowViolations,
      tone: m.templateWindowViolations === 0 ? ("success" as const) : ("danger" as const),
    },
  ];

  const toneText = (tone: string) =>
    tone === "success"
      ? "text-[color:var(--ds-success-text)]"
      : tone === "warning"
        ? "text-[color:var(--ds-warning-text)]"
        : tone === "danger"
          ? "text-[color:var(--ds-danger-text)]"
          : "text-[color:var(--ds-text)]";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-[color:var(--ds-border)]">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageCircle size={15} className="text-[color:var(--brand-primary)]" />
            {isEn ? "Secretary Gate (30d)" : "Sekretariats-Gate (30T)"}
          </CardTitle>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {isEn
              ? "WhatsApp compliance — consent, 24h window, delivery."
              : "WhatsApp-Compliance — Consent, 24h-Fenster, Zustellung."}
          </p>
        </div>
        <Badge
          variant="default"
          className={
            m.gatePass
              ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
              : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
          }
        >
          {m.gatePass ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={11} /> {isEn ? "PASS" : "OK"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {isEn ? "FAIL" : "FAIL"}
            </span>
          )}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className={`text-xl font-semibold tabular-nums ${toneText(s.tone)}`}>{s.value}</p>
            <p className="mt-0.5 text-[10px] font-medium text-[color:var(--ds-text-muted)]">
              {s.label}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
