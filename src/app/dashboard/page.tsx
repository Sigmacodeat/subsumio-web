"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Briefcase, CalendarClock, Inbox, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/dashboard/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { WidgetDashboard } from "@/components/dashboard/widget-dashboard";
import { useBrainStats, useRecentQueries } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import type { BrainStats, RecentQuery } from "@/lib/types";

export default function DashboardPage() {
  const statsQuery = useBrainStats();
  const recentQuery = useRecentQueries(5);
  const { t } = useLang();

  const stats = (statsQuery.data ?? null) as BrainStats | null;
  const recent = (recentQuery.data ?? []) as RecentQuery[];
  const loading = statsQuery.isLoading && recentQuery.isLoading;
  const degraded = statsQuery.isError;

  const engineOnline = useMemo(() => {
    if (stats) {
      return stats.total_pages > 0 || stats.total_edges > 0 || stats.total_queries > 0;
    }
    if (recent.length > 0) return true;
    return false;
  }, [stats, recent.length]);

  if (loading) {
    return <PageSkeleton />;
  }

  const isFirstTime =
    !loading && !degraded && (stats?.total_pages ?? 0) === 0 && (stats?.total_queries ?? 0) === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-10">
      {isFirstTime && (
        <div className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-[color:var(--ds-surface)] p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-[color:var(--ds-text)]">
                {t("dashboard.welcome")}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                {t("dashboard.welcome_desc")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/cases/new">
                <Button size="sm" variant="glow">
                  <Briefcase size={14} /> {t("cockpit.action_case")}
                </Button>
              </Link>
              <Link href="/dashboard/import-kanzlei">
                <Button size="sm" variant="outline">
                  <Upload size={14} /> {t("dashboard.welcome_upload")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.desc_online")}
        actions={
          <div className="flex items-center gap-2.5" role="status" aria-live="polite">
            {!loading && (
              <Badge
                variant={degraded ? "warning" : engineOnline ? "success" : "info"}
                className="text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${degraded ? "bg-amber-500" : "bg-emerald-500"}`}
                />
                {degraded ? t("cockpit.ai_limited") : t("dashboard.connected")}
              </Badge>
            )}
            <Link href="/dashboard/deadlines">
              <Button size="sm" variant="outline">
                <CalendarClock size={14} /> {t("cockpit.action_deadline")}
              </Button>
            </Link>
            <Link href="/dashboard/intake">
              <Button size="sm" variant="outline">
                <Inbox size={14} /> {t("cockpit.action_intake")}
              </Button>
            </Link>
            <Link href="/dashboard/cases/new">
              <Button size="sm" variant="glow">
                <Briefcase size={14} /> {t("cockpit.action_case")}
              </Button>
            </Link>
          </div>
        }
      />

      <WidgetDashboard />
    </div>
  );
}
