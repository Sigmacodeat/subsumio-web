"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, TrendingUp, Scale, Info } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { CourtAnalytics } from "@/lib/court-analytics";
import { ANALYTICS_DISCLAIMER_DE } from "@/lib/court-analytics";

export default function CourtAnalyticsPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [data, setData] = useState<CourtAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/court-analytics");
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      setData(json.analytics ?? []);
    } catch {
      addToast({ type: "error", title: t("court_an.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("court_an.title")}
        description={t("court_an.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Analytics" }]}
      />

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{ANALYTICS_DISCLAIMER_DE}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <TrendingUp className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("court_an.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((item) => (
            <div
              key={`${item.court}-${item.chamber ?? ""}`}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Scale className="h-5 w-5" /> {item.court}
                  {item.chamber && (
                    <span className="text-sm text-[color:var(--ds-text-muted)]">
                      — {item.chamber}
                    </span>
                  )}
                </h3>
                <Badge>
                  {item.total_decisions} {t("court_an.decisions")}
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3">
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("court_an.duration")}
                  </p>
                  <p className="text-lg font-semibold">
                    {item.avg_duration_days > 0 ? `${item.avg_duration_days.toFixed(0)} Tage` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3">
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("court_an.plaintiff_wins")}
                  </p>
                  <p className="text-lg font-semibold">
                    {item.outcome_distribution.plaintiff_wins} (
                    {item.total_decisions > 0
                      ? Math.round(
                          (item.outcome_distribution.plaintiff_wins / item.total_decisions) * 100
                        )
                      : 0}
                    %)
                  </p>
                </div>
                <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3">
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("court_an.defendant_wins")}
                  </p>
                  <p className="text-lg font-semibold">
                    {item.outcome_distribution.defendant_wins} (
                    {item.total_decisions > 0
                      ? Math.round(
                          (item.outcome_distribution.defendant_wins / item.total_decisions) * 100
                        )
                      : 0}
                    %)
                  </p>
                </div>
                <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3">
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("court_an.citations")}
                  </p>
                  <p className="text-lg font-semibold">{item.citation_frequency}</p>
                </div>
              </div>
              {item.top_legal_areas.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-[color:var(--ds-text-muted)]">
                    {t("court_an.top_areas")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.top_legal_areas.slice(0, 5).map((area) => (
                      <Badge key={area.area} variant="default">
                        {area.area} ({area.count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
