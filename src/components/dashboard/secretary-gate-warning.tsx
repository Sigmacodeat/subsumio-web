"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";

interface SecretaryMetrics {
  gatePass: boolean;
  consentViolations: number;
  templateWindowViolations: number;
}

interface MetricsResponse {
  metrics: SecretaryMetrics;
}

async function loadSecretaryGate(): Promise<MetricsResponse | null> {
  try {
    const res = await fetch("/api/legal/secretary-metrics?days=7", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as MetricsResponse;
  } catch {
    return null;
  }
}

/**
 * Compact secretary-gate warning banner for the main dashboard.
 * Only renders when gatePass === false (compliance breach detected).
 * Invisible when gate is passing or metrics are unavailable.
 */
export function SecretaryGateWarning() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const query = useQuery({
    queryKey: ["secretary-metrics", 7],
    queryFn: loadSecretaryGate,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  const metrics = query.data?.metrics;
  if (!metrics || metrics.gatePass) return null;

  const violations = metrics.consentViolations + metrics.templateWindowViolations;

  return (
    <Link
      href="/dashboard/admin"
      className="group flex items-center gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 transition-all hover:scale-[1.005] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
      role="alert"
    >
      <AlertTriangle size={18} className="shrink-0 text-[color:var(--ds-danger-text)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
          {isEn
            ? "Secretary compliance gate FAILED"
            : "Sekretariats-Compliance-Gate FEHLGESCHLAGEN"}
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--ds-danger-text)]/80">
          {isEn
            ? `${violations} violation(s) in the last 7 days. Review required.`
            : `${violations} Verstoß/Verstöße in den letzten 7 Tagen. Überprüfung erforderlich.`}
        </p>
      </div>
      <ArrowRight
        size={14}
        className="shrink-0 text-[color:var(--ds-danger-text)] transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
