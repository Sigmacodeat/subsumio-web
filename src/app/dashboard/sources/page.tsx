"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useLang } from "@/lib/use-lang";
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
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import type {
  SourceRegistryEntry,
  SourceRegistryResponse,
  SourceStatus,
  SourceType,
  AuthorityTier,
  JurisdictionCode,
} from "@/lib/source-registry";

// ── Status config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SourceStatus,
  { label: string; color: string; bg: string; border: string; icon: React.ElementType }
> = {
  fresh: {
    label: "Aktuell",
    color: "text-emerald-600",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/20",
    icon: CheckCircle2,
  },
  stale: {
    label: "Veraltet",
    color: "text-amber-600",
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
    icon: Clock,
  },
  syncing: {
    label: "Synchronisiert",
    color: "text-blue-600",
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
    icon: RefreshCw,
  },
  error: {
    label: "Fehler",
    color: "text-red-600",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
    icon: XCircle,
  },
  unknown: {
    label: "Unbekannt",
    color: "text-[color:var(--ds-text-muted)]",
    bg: "bg-[color:var(--ds-hover)]",
    border: "border-[color:var(--ds-border)]",
    icon: AlertTriangle,
  },
};

const TYPE_CONFIG: Record<SourceType, { label: string; icon: React.ElementType }> = {
  statute_corpus: { label: "Gesetzeskorpus", icon: Scale },
  judgement_api: { label: "Judikatur-API", icon: Landmark },
  regulatory_feed: { label: "Regulatorischer Feed", icon: Globe },
  commercial: { label: "Kommerziell", icon: Database },
};

const AUTHORITY_CONFIG: Record<AuthorityTier, { label: string; badge: string }> = {
  official: {
    label: "Offiziell",
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  "semi-official": {
    label: "Semi-offiziell",
    badge: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  community: { label: "Community", badge: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  commercial: {
    label: "Kommerziell",
    badge: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
};

const JURISDICTION_LABELS: Record<JurisdictionCode, string> = {
  DE: "🇩🇪 Deutschland",
  AT: "🇦🇹 Österreich",
  CH: "🇨🇭 Schweiz",
  EU: "🇪🇺 EU",
  ALL: "🌍 Alle",
};

// ── Source Card ───────────────────────────────────────────────────────

function SourceCard({
  source,
  onRefresh,
  refreshing,
}: {
  source: SourceRegistryEntry;
  onRefresh: (id: string) => void;
  refreshing: string | null;
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
        "rounded-xl border bg-[color:var(--ds-surface)] transition-all",
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
              {statusCfg.label}
            </span>
            <Badge variant="default" className={cn("border text-xs", authCfg.badge)}>
              {authCfg.label}
            </Badge>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
            <span>{JURISDICTION_LABELS[source.jurisdiction]}</span>
            <span className="flex items-center gap-1">
              <FileText size={10} />
              {source.document_count} Dokumente
            </span>
            {source.freshness_hours !== null && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {source.freshness_hours < 24
                  ? `vor ${source.freshness_hours}h`
                  : `vor ${Math.floor(source.freshness_hours / 24)}d`}
              </span>
            )}
            {source.last_sync_at && (
              <span>Sync: {new Date(source.last_sync_at).toLocaleDateString("de-DE")}</span>
            )}
          </div>

          {source.last_error && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle size={11} />
              {source.last_error}
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
                className="brand-text flex items-center gap-1 text-xs hover:underline"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {source.diff_log.length} Änderung(en) seit letztem Sync
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
                            ? "bg-emerald-500/10 text-emerald-600"
                            : diff.change_type === "modified"
                              ? "bg-amber-500/10 text-amber-600"
                              : "bg-red-500/10 text-red-600"
                        )}
                      >
                        {diff.change_type === "added"
                          ? "Neu"
                          : diff.change_type === "modified"
                            ? "Geändert"
                            : "Entfernt"}
                      </span>
                      <span className="font-mono">{diff.statute_code}</span>
                      <span className="text-[color:var(--ds-text-subtle)]">
                        {new Date(diff.detected_at).toLocaleDateString("de-DE")}
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
            Sync
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────

function StatsBar({ registry }: { registry: SourceRegistryResponse }) {
  const stats = [
    { label: "Gesamt", value: registry.total, color: "text-[color:var(--ds-text)]" },
    { label: "Aktuell", value: registry.fresh, color: "text-emerald-600" },
    { label: "Veraltet", value: registry.stale, color: "text-amber-600" },
    { label: "Fehler", value: registry.error, color: "text-red-600" },
    { label: "Unbekannt", value: registry.unknown, color: "text-[color:var(--ds-text-muted)]" },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center"
        >
          <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function SourcesPage() {
  const { t } = useLang();
  const [registry, setRegistry] = useState<SourceRegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Filters
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (jurisdictionFilter !== "all") params.jurisdiction = jurisdictionFilter;
      if (typeFilter !== "all") params.type = typeFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api.sources.list(params);
      setRegistry(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quellen-Status konnte nicht geladen werden.");
      setRegistry(null);
    } finally {
      setLoading(false);
    }
  }, [jurisdictionFilter, typeFilter, statusFilter]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  async function handleRefresh(sourceId: string) {
    setRefreshing(sourceId);
    setMessage(null);
    setError(null);
    try {
      const result = await api.sources.refresh(sourceId);
      setMessage(
        `${result.label}: ${result.sync_summary?.imported ?? 0} Dokumente synchronisiert.`
      );
      await loadSources();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync fehlgeschlagen.");
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
    a.download = `source-registry-${new Date().toISOString().slice(0, 10)}.json`;
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
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Rechtsquellen"
        description="Quellen-Registry — Status, Freshness und Provenance aller Rechtsdaten"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Rechtsquellen" }]}
        actions={
          <Button
            onClick={handleExport}
            disabled={!registry}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
          >
            <Download size={14} />
            Export
          </Button>
        }
      />

      {/* Messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600">
          <CheckCircle2 size={16} className="shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      {registry && <StatsBar registry={registry} />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
        <Filter size={14} className="text-[color:var(--ds-text-muted)]" />
        <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">Filter:</span>
        <select
          value={jurisdictionFilter}
          onChange={(e) => setJurisdictionFilter(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Jurisdiktionen</option>
          <option value="DE">🇩🇪 Deutschland</option>
          <option value="AT">🇦🇹 Österreich</option>
          <option value="CH">🇨🇭 Schweiz</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Typen</option>
          <option value="statute_corpus">Gesetzeskorpus</option>
          <option value="judgement_api">Judikatur-API</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Status</option>
          <option value="fresh">Aktuell</option>
          <option value="stale">Veraltet</option>
          <option value="error">Fehler</option>
          <option value="unknown">Unbekannt</option>
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
          Aktualisieren
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("aria.loading")}
        >
          <Loader2 size={24} className="brand-text animate-spin" />
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="space-y-4 py-20 text-center">
          <Database size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <div>
            <p className="text-[color:var(--ds-text-muted)]">Keine Quellen gefunden.</p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
              Passen Sie die Filter an oder aktualisieren Sie die Ansicht.
            </p>
          </div>
        </div>
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
                    {typeCfg.label}
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
          Über die Quellen-Registry
        </h3>
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          Die Source Registry ist die zentrale Instanz für Rechtsdaten-Provenance in Subsumio. Sie
          verfolgt den Status aller Rechtsquellen — Gesetzeskorpora, Judikatur-APIs und
          regulatorische Feeds — mit Freshness-Indikatoren, Authority-Tier und Sync-Historie. Jede
          AI-Antwort kann über die Registry nachweisen, aus welchen Quellen und welchem Stand sie
          stammt.
        </p>
        <div className="flex items-center gap-4 pt-1 text-xs text-[color:var(--ds-text-muted)]">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} className="text-emerald-600" />
            Fresh = innerhalb des Sync-Intervalls
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} className="text-amber-600" />
            Stale = Sync-Intervall überschritten
          </span>
          <span className="flex items-center gap-1">
            <XCircle size={11} className="text-red-600" />
            Error = Sync fehlgeschlagen
          </span>
        </div>
      </div>
    </div>
  );
}
