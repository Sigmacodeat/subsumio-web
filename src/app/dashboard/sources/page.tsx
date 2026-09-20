"use client";

import { useState, useMemo } from "react";
import { useLang } from "@/lib/use-lang";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { useApiQuery } from "@/lib/use-api-query";
import type { TFunc } from "@/content/dashboard";
import {
  Database,
  Globe,
  Landmark,
  Scale,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  ChevronDown,
  ChevronRight,
  Filter,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import type {
  SourceRegistryEntry,
  SourceRegistryResponse,
  SourceStatus,
  SourceType,
  AuthorityTier,
  JurisdictionCode,
} from "@/lib/source-registry";
import type { DashboardKey } from "@/content/dashboard";

// ── Status config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SourceStatus,
  { labelKey: DashboardKey; color: string; bg: string; border: string; icon: React.ElementType }
> = {
  fresh: {
    labelKey: "sources.status_fresh",
    color: "text-[color:var(--ds-success-text)]",
    bg: "bg-[color:var(--ds-success-bg)]",
    border: "border-[color:var(--ds-success-border)]",
    icon: CheckCircle2,
  },
  stale: {
    labelKey: "sources.status_stale",
    color: "text-[color:var(--ds-warning-text)]",
    bg: "bg-[color:var(--ds-warning-bg)]",
    border: "border-[color:var(--ds-warning-border)]",
    icon: Clock,
  },
  syncing: {
    labelKey: "sources.status_syncing",
    color: "text-[color:var(--ds-info-text)]",
    bg: "bg-[color:var(--ds-info-bg)]",
    border: "border-[color:var(--ds-info-border)]",
    icon: RefreshCw,
  },
  error: {
    labelKey: "sources.status_error",
    color: "text-[color:var(--ds-danger-text)]",
    bg: "bg-[color:var(--ds-danger-bg)]",
    border: "border-[color:var(--ds-danger-border)]",
    icon: XCircle,
  },
  unknown: {
    labelKey: "sources.status_unknown",
    color: "text-[color:var(--ds-text-muted)]",
    bg: "bg-[color:var(--ds-hover)]",
    border: "border-[color:var(--ds-border)]",
    icon: AlertTriangle,
  },
};

const TYPE_CONFIG: Record<SourceType, { labelKey: DashboardKey; icon: React.ElementType }> = {
  statute_corpus: { labelKey: "sources.type_statute", icon: Scale },
  judgement_api: { labelKey: "sources.type_judgement", icon: Landmark },
  literature_corpus: { labelKey: "sources.type_literature", icon: FileText },
  regulatory_feed: { labelKey: "sources.type_regulatory", icon: Globe },
  commercial: { labelKey: "sources.type_commercial", icon: Database },
};

const AUTHORITY_CONFIG: Record<AuthorityTier, { labelKey: DashboardKey; badge: string }> = {
  official: {
    labelKey: "sources.auth_official",
    badge:
      "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] border-[color:var(--ds-success-border)]",
  },
  "semi-official": {
    labelKey: "sources.auth_semi",
    badge:
      "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)] border-[color:var(--ds-info-border)]",
  },
  community: {
    labelKey: "sources.auth_community",
    badge:
      "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] border-[color:var(--ds-warning-border)]",
  },
  commercial: {
    labelKey: "sources.auth_commercial",
    badge:
      "bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] border-[color:var(--ds-border)]",
  },
};

const JURISDICTION_LABEL_KEYS: Partial<Record<JurisdictionCode, DashboardKey>> = {
  AT: "norms.jurisdiction_at",
};

// ── Source Card ───────────────────────────────────────────────────────

function SourceCard({
  source,
  onRefresh,
  refreshing,
  t,
}: {
  source: SourceRegistryEntry;
  onRefresh: (id: string) => void;
  refreshing: string | null;
  t: TFunc;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[source.status];
  const typeCfg = TYPE_CONFIG[source.type];
  const authCfg = AUTHORITY_CONFIG[source.authority_tier];
  const StatusIcon = statusCfg.icon;
  const TypeIcon = typeCfg.icon;
  const isRefreshing = refreshing === source.id;

  return (
    <div
      className={cn(
        "rounded-xl border bg-[color:var(--ds-surface)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        statusCfg.border,
        expanded && "ring-1 ring-[color:var(--brand-primary)]/20"
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Type icon */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            statusCfg.bg,
            statusCfg.border
          )}
        >
          <TypeIcon size={18} className={statusCfg.color} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[color:var(--ds-text)]">{source.label}</span>
            <span className={cn("text-xs font-medium", statusCfg.color)}>
              <StatusIcon size={11} className="mr-0.5 inline" />
              {t(statusCfg.labelKey)}
            </span>
            <Badge variant="default" className={cn("border text-xs", authCfg.badge)}>
              {t(authCfg.labelKey)}
            </Badge>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
            <span>
              {JURISDICTION_LABEL_KEYS[source.jurisdiction]
                ? t(JURISDICTION_LABEL_KEYS[source.jurisdiction]!)
                : source.jurisdiction}
            </span>
            <span className="flex items-center gap-1">
              <FileText size={10} />
              {source.document_count} {t("sources.docs_count")}
            </span>
            {source.freshness_hours !== null && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {source.freshness_hours < 24
                  ? t("sources.ago_h").replace("{h}", String(source.freshness_hours))
                  : t("sources.ago_d").replace(
                      "{d}",
                      String(Math.floor(source.freshness_hours / 24))
                    )}
              </span>
            )}
            {source.last_sync_at && (
              <span>
                {t("sources.sync_label")} {formatDate(source.last_sync_at)}
              </span>
            )}
          </div>

          {source.last_error && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={11} />
              Der letzte Abgleich ist fehlgeschlagen. Bitte später erneut abgleichen.
            </p>
          )}

          {/* License */}
          <p className="mt-1 truncate text-xs text-[color:var(--ds-text-subtle)]">
            {source.license}
          </p>

          {/* Diff log */}
          {source.diff_log && source.diff_log.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {source.diff_log.length} {t("sources.changes_since_sync")}
              </button>
              {expanded && (
                <div className="mt-2 space-y-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-2">
                  {source.diff_log.map((diff, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]"
                    >
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-medium",
                          diff.change_type === "added"
                            ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                            : diff.change_type === "modified"
                              ? "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                              : "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                        )}
                      >
                        {diff.change_type === "added"
                          ? t("sources.diff_added")
                          : diff.change_type === "modified"
                            ? t("sources.diff_modified")
                            : t("sources.diff_removed")}
                      </span>
                      <span className="tabular-nums">{diff.statute_code}</span>
                      <span className="text-[color:var(--ds-text-subtle)]">
                        {formatDate(diff.detected_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0">
          <Button
            variant="ghost"
            size="sm"
            disabled={!source.enabled || isRefreshing}
            onClick={() => onRefresh(source.id)}
            className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            {isRefreshing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {t("sources.sync_btn")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────

function StatsBar({ registry, t }: { registry: SourceRegistryResponse; t: TFunc }) {
  const stats = [
    { label: t("sources.stat_total"), value: registry.total, color: "text-[color:var(--ds-text)]" },
    {
      label: t("sources.stat_fresh"),
      value: registry.fresh,
      color: "text-[color:var(--ds-success-text)]",
    },
    {
      label: t("sources.stat_stale"),
      value: registry.stale,
      color: "text-[color:var(--ds-warning-text)]",
    },
    {
      label: t("sources.stat_error"),
      value: registry.error,
      color: "text-[color:var(--ds-danger-text)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center"
        >
          {/* No colour at zero (design standard). */}
          <p
            className={cn(
              "text-2xl font-bold tabular-nums",
              s.value > 0 ? s.color : "text-[color:var(--ds-text)]"
            )}
          >
            {s.value}
          </p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function SourcesPage() {
  const { t } = useLang();
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const {
    data: registryData,
    loading,
    error,
    refetch: loadSources,
  } = useApiQuery<SourceRegistryResponse>(async () => {
    const params: Record<string, string> = { jurisdiction: "AT" };
    if (typeFilter !== "all") params.type = typeFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    return api.sources.list(params);
  }, [typeFilter, statusFilter]);

  const registry = registryData;

  async function handleRefresh(sourceId: string) {
    setRefreshing(sourceId);
    setMessage(null);
    setRefreshError(null);
    try {
      const result = await api.sources.refresh(sourceId);
      setMessage(
        `${result.label}: ${result.sync_summary?.imported ?? 0} ${t("sources.docs_count")} synchronisiert.`
      );
      await loadSources();
    } catch {
      setRefreshError(t("sources.sync_failed"));
    } finally {
      setRefreshing(null);
    }
  }

  function handleExport() {
    if (!registry) return;
    const data = JSON.stringify(registry, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rechtsquellen-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredSources = useMemo(() => {
    if (!registry) return [];
    return registry.sources;
  }, [registry]);

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<string, SourceRegistryEntry[]> = {};
    for (const s of filteredSources) {
      if (!groups[s.type]) groups[s.type] = [];
      groups[s.type].push(s);
    }
    return groups;
  }, [filteredSources]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("sources.title")}
        description={t("sources.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("sources.breadcrumb") },
        ]}
        actions={
          <Button
            onClick={handleExport}
            disabled={!registry}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
          >
            <Download size={14} />
            {t("sources.export")}
          </Button>
        }
      />

      {/* Messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-3 text-sm text-[color:var(--ds-success-text)]">
          <CheckCircle2 size={16} className="shrink-0" />
          {message}
        </div>
      )}
      {(error || refreshError) && (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <XCircle size={16} className="shrink-0" />
          {refreshError ??
            "Die Rechtsquellen konnten nicht geladen werden. Bitte versuchen Sie es erneut."}
        </div>
      )}

      {/* Stats */}
      {registry && <StatsBar registry={registry} t={t} />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
        <Filter size={14} className="text-[color:var(--ds-text-muted)]" />
        <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
          {t("sources.filter")}
        </span>
        <span className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-1 text-xs font-medium text-[color:var(--ds-text)]">
          {t("norms.jurisdiction_at")}
        </span>
        <select
          aria-label={t("sources.type_filter" as DashboardKey)}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        >
          <option value="all">{t("sources.all_types")}</option>
          <option value="statute_corpus">{t("sources.type_statute")}</option>
          <option value="judgement_api">{t("sources.type_judgement")}</option>
          <option value="literature_corpus">{t("sources.type_literature")}</option>
        </select>
        <select
          aria-label={t("sources.status_filter" as DashboardKey)}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        >
          <option value="all">{t("sources.all_status")}</option>
          <option value="fresh">{t("sources.stat_fresh")}</option>
          <option value="stale">{t("sources.stat_stale")}</option>
          <option value="error">{t("sources.stat_error")}</option>
          <option value="unknown">{t("sources.stat_unknown")}</option>
        </select>
        <div className="flex-1" />
        <Button
          onClick={loadSources}
          variant="ghost"
          size="sm"
          disabled={loading}
          className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {t("sources.refresh")}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <PageSkeleton rows={5} className="p-0" />
      ) : filteredSources.length === 0 ? (
        <EmptyState
          icon={Database}
          title={t("sources.empty")}
          description={t("sources.empty_hint")}
          actionLabel={t("sources.refresh")}
          onAction={() => void loadSources()}
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, sources]) => {
            const typeCfg = TYPE_CONFIG[type as SourceType];
            if (!typeCfg) return null;
            const TypeIcon = typeCfg.icon;
            return (
              <div key={type} className="space-y-3">
                <div className="flex items-center gap-2">
                  <TypeIcon size={16} className="text-[color:var(--ds-text-muted)]" />
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t(typeCfg.labelKey)}
                  </h2>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    ({sources.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {sources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      onRefresh={handleRefresh}
                      refreshing={refreshing}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info panel */}
      <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("sources.about_title")}
        </h3>
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          {t("sources.about_desc")}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-[color:var(--ds-text-muted)]">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} className="text-[color:var(--ds-success-text)]" />
            {t("sources.fresh_hint")}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} className="text-[color:var(--ds-warning-text)]" />
            {t("sources.stale_hint")}
          </span>
          <span className="flex items-center gap-1">
            <XCircle size={11} className="text-[color:var(--ds-danger-text)]" />
            {t("sources.error_hint")}
          </span>
        </div>
      </div>
    </div>
  );
}
