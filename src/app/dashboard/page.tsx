"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Network,
  MessageSquare,
  TrendingUp,
  Upload,
  ArrowRight,
  Zap,
  FileText,
  Users,
  Link2,
  Scale,
  CalendarClock,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageSkeleton, RowSkeleton } from "@/components/dashboard/skeleton";
import { StatsCard } from "@/components/dashboard/stats-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { WidgetDashboard } from "@/components/dashboard/widget-dashboard";
import { useBrainStats, useRecentQueries, usePages } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import type { BrainStats, RecentQuery } from "@/lib/types";

const QUICK_ACTIONS: { href: string; icon: typeof Upload; labelKey: DashboardKey; descKey: DashboardKey }[] = [
  { href: "/dashboard/upload", icon: Upload, labelKey: "dashboard.qa_upload", descKey: "dashboard.qa_upload_desc" },
  { href: "/dashboard/query", icon: MessageSquare, labelKey: "dashboard.qa_query", descKey: "dashboard.qa_query_desc" },
  { href: "/dashboard/brain", icon: BookOpen, labelKey: "dashboard.qa_explore", descKey: "dashboard.qa_explore_desc" },
  { href: "/dashboard/graph", icon: Network, labelKey: "dashboard.qa_graph", descKey: "dashboard.qa_graph_desc" },
];

function formatStat(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function timeAgo(dateStr: string, t: (k: DashboardKey) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("dashboard.time_now");
  if (mins < 60) return `${t("dashboard.time_min")} ${mins} ${t("dashboard.time_min_suffix")}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${t("dashboard.time_min")} ${hours} ${t("dashboard.time_hour_suffix")}`;
  const days = Math.floor(hours / 24);
  return `${t("dashboard.time_day")} ${days} ${days !== 1 ? t("dashboard.time_days_suffix") : t("dashboard.time_day_suffix")}`;
}

export default function DashboardPage() {
  const statsQuery = useBrainStats();
  const recentQuery = useRecentQueries(5);
  const statutesQuery = usePages({ limit: 1, type: "statute" });
  const deadlinesQuery = usePages({ limit: 10, type: "legal_deadline" });
  const { t } = useLang();

  const stats = (statsQuery.data ?? null) as BrainStats | null;
  const recent = ((recentQuery.data ?? []) as RecentQuery[]);
  const loading = statsQuery.isLoading && recentQuery.isLoading;
  const error = statsQuery.isError ? t("dashboard.error_load") : null;

  const engineOnline = useMemo(() => {
    if (stats) {
      return stats.total_pages > 0 || stats.total_edges > 0 || stats.total_queries > 0;
    }
    if (recent.length > 0) return true;
    return false;
  }, [stats, recent.length]);

  const statutesCount = useMemo(() => {
    if (statutesQuery.isLoading) return null;
    const pages = statutesQuery.data;
    if (Array.isArray(pages) && pages.length > 0) {
      return stats?.total_pages ?? pages.length;
    }
    return 0;
  }, [statutesQuery.data, statutesQuery.isLoading, stats]);

  const deadlines = useMemo(() => {
    const pages = deadlinesQuery.data;
    if (!Array.isArray(pages)) return [];
    const now = new Date();
    return (pages as unknown as Record<string, unknown>[])
      .map((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        const dueStr = (fm.due_date || fm.date || p.created_at) as string | undefined;
        if (!dueStr) return null;
        const due = new Date(dueStr);
        const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: String(p.slug ?? p.id ?? ""),
          title: String(p.title ?? t("dashboard.unnamed_deadline")),
          dueDate: dueStr,
          daysLeft,
          overdue: daysLeft < 0 && fm.status !== "done",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  }, [deadlinesQuery.data, t]);

  const statCards = [
    { label: t("dashboard.stat_pages"), value: stats ? formatStat(stats.total_pages) : "—", icon: BookOpen, color: "violet" },
    { label: t("dashboard.stat_entities"), value: stats ? formatStat(stats.total_entities) : "—", icon: Users, color: "blue" },
    { label: t("dashboard.stat_edges"), value: stats ? formatStat(stats.total_edges) : "—", icon: Link2, color: "emerald" },
    { label: t("dashboard.stat_queries"), value: stats ? formatStat(stats.total_queries) : "—", icon: MessageSquare, color: "amber" },
    { label: t("dashboard.stat_statutes"), value: statutesCount !== null ? String(statutesCount) : "—", icon: Scale, color: "emerald" },
  ];

  const gettingStarted = [
    { step: 1, done: (stats?.total_pages ?? 0) > 0, label: t("dashboard.gs_upload"), desc: t("dashboard.gs_upload_desc"), action: t("dashboard.gs_upload_btn"), href: "/dashboard/upload" },
    { step: 2, done: (stats?.total_queries ?? 0) > 0, label: t("dashboard.gs_query"), desc: t("dashboard.gs_query_desc"), action: t("dashboard.gs_query_btn"), href: "/dashboard/query" },
    { step: 3, done: (stats?.total_edges ?? 0) > 0, label: t("dashboard.gs_graph"), desc: t("dashboard.gs_graph_desc"), action: t("dashboard.gs_graph_btn"), href: "/dashboard/graph" },
  ];

  if (loading) {
    return <PageSkeleton />;
  }

  if (error && !engineOnline) {
    return (
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-6 py-8 text-center">
          <p className="text-sm font-medium text-red-700 mb-2">{error}</p>
          <p className="text-xs text-[color:var(--ds-text-muted)] mb-4">{t("dashboard.error_engine")}</p>
          <Button variant="outline" size="sm" onClick={() => statsQuery.refetch()}>
            {t("dashboard.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const isFirstTime = !loading && !error && (stats?.total_pages ?? 0) === 0 && (stats?.total_queries ?? 0) === 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Welcome banner for first-time users */}
      {isFirstTime && (
        <div className="rounded-2xl border border-[color:var(--brand-primary)]/20 bg-gradient-to-br from-[color:var(--brand-primary)]/5 to-transparent p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl brand-soft border brand-border flex items-center justify-center shrink-0">
              <Zap size={22} className="brand-text" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-[color:var(--ds-text)] mb-1">{t("dashboard.welcome")}</h2>
              <p className="text-sm text-[color:var(--ds-text-muted)] leading-relaxed mb-4">
                {t("dashboard.welcome_desc")}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard/upload">
                  <Button size="sm" variant="glow">
                    <Upload size={14} /> {t("dashboard.welcome_upload")}
                  </Button>
                </Link>
                <Link href="/dashboard/query">
                  <Button size="sm" variant="outline">
                    <MessageSquare size={14} /> {t("dashboard.welcome_ask")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title={t("dashboard.title")}
        description={loading ? t("dashboard.desc_loading") : engineOnline ? t("dashboard.desc_online") : t("dashboard.desc_offline")}
        actions={
          <div className="flex items-center gap-2.5" role="status" aria-live="polite">
            {!loading && (
              <Badge variant={engineOnline ? "success" : "warning"} className="text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${engineOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
                {engineOnline ? t("dashboard.connected") : t("dashboard.offline")}
              </Badge>
            )}
            <Link href="/dashboard/upload">
              <Button size="sm" variant="glow">
                <Upload size={14} /> {t("dashboard.add_document")}
              </Button>
            </Link>
          </div>
        }
      />

      {/* Customizable Widget Dashboard */}
      <WidgetDashboard />
    </div>
  );
}
