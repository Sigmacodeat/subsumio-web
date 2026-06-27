"use client";

import { useMemo, useState } from "react";
import {
  Shield,
  Search,
  Calendar,
  Clock,
  FileText,
  User,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auditLabel, type AuditEntry } from "@/lib/audit-labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { useApiQuery } from "@/lib/use-api-query";
import type { Lang } from "@/content/site";

const PAGE_SIZE = 25;

const ACTION_COLORS: Record<string, string> = {
  "user.login": "emerald",
  "user.logout": "gray",
  "user.signup": "blue",
  "case.create": "violet",
  "case.update": "amber",
  "case.delete": "red",
  "case.view": "slate",
  "invoice.create": "emerald",
  "invoice.update": "amber",
  "invoice.delete": "red",
  "invoice.send": "cyan",
  "invoice.remind": "orange",
  "document.upload": "blue",
  "document.delete": "red",
  "deadline.create": "orange",
  "deadline.update": "amber",
  "deadline.delete": "red",
  "evidence.create": "violet",
  "evidence.update": "amber",
  "evidence.delete": "red",
  "drafting.generate": "cyan",
  "drafting.export": "blue",
  "conflict.check": "pink",
  "judgements.search": "indigo",
  "legal.tabular": "teal",
  "legal.statute": "indigo",
  "legal.rvg": "amber",
  "legal.ai_deadlines": "orange",
  "legal.contract_draft": "violet",
  "legal.document_review": "blue",
  "legal.due_diligence": "violet",
  "legal.risk_analysis": "red",
  "legal.memo": "cyan",
  "legal.redline": "pink",
  "legal.anonymize": "slate",
  "legal.judgements_sync": "teal",
  "settings.update": "gray",
  "billing.upgrade": "emerald",
  "team.invite": "blue",
  "team.remove": "red",
  "team.role_change": "amber",
  "connector.add": "blue",
  "connector.remove": "red",
  "connector.sync": "cyan",
  "query.submit": "pink",
  "data.export": "slate",
  "data.delete": "red",
};

function actionColor(action: string): string {
  return ACTION_COLORS[action] || "gray";
}

function actionIcon(action: string) {
  if (action.startsWith("user.")) return User;
  if (action.startsWith("case.")) return FileText;
  if (action.startsWith("invoice.")) return CheckCircle2;
  if (action.startsWith("document.")) return FileText;
  if (action.startsWith("deadline.")) return Clock;
  if (action.startsWith("evidence.")) return Shield;
  if (action.startsWith("drafting.")) return FileText;
  if (action.startsWith("query.")) return Search;
  if (action.startsWith("settings.")) return Shield;
  if (action.startsWith("billing.")) return CheckCircle2;
  if (action.startsWith("team.")) return User;
  if (action.startsWith("connector.")) return RefreshCw;
  if (action.startsWith("legal.")) return AlertTriangle;
  if (action.startsWith("data.")) return Download;
  return AlertTriangle;
}

function formatTimestamp(lang: Lang, ts: string): string {
  try {
    return new Date(ts).toLocaleString(lang === "en" ? "en-GB" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatRelative(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "gerade eben";
    if (mins < 60) return `vor ${mins} Min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `vor ${days} Tag${days > 1 ? "en" : ""}`;
    const months = Math.floor(days / 30);
    return `vor ${months} Monat${months > 1 ? "en" : ""}`;
  } catch {
    return "";
  }
}

export default function AuditLogPage() {
  const { t, lang } = useLang();
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const {
    data: auditData,
    loading,
    error,
    refetch: loadEntries,
  } = useApiQuery<{ entries: AuditEntry[] }>(async () => {
    const params = new URLSearchParams();
    if (filterAction) params.set("action", filterAction);
    if (filterEntityType) params.set("entityType", filterEntityType);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    params.set("limit", "500");
    const res = await fetch(`/api/audit?${params.toString()}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { entries: AuditEntry[] };
  }, [filterAction, filterEntityType, filterFrom, filterTo]);

  const entries = useMemo(() => auditData?.entries ?? [], [auditData]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return entries.filter((e) => {
      if (!s) return true;
      return (
        e.action.toLowerCase().includes(s) ||
        auditLabel(e.action).toLowerCase().includes(s) ||
        e.entityType.toLowerCase().includes(s) ||
        (e.entityId || "").toLowerCase().includes(s) ||
        (e.userEmail || "").toLowerCase().includes(s) ||
        (e.details ? JSON.stringify(e.details).toLowerCase().includes(s) : false)
      );
    });
  }, [entries, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const uniqueActions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries]
  );
  const uniqueEntityTypes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entityType).filter(Boolean))).sort(),
    [entries]
  );

  function exportCsv() {
    const lines = [
      "timestamp,action,label,entityType,entityId,userEmail,details",
      ...filtered.map((e) => {
        const ts = new Date(e.timestamp).toISOString();
        const label = auditLabel(e.action);
        const details = e.details
          ? JSON.stringify(e.details).replace(/,/g, ";").replace(/"/g, "'")
          : "";
        return `"${ts}","${e.action}","${label}","${e.entityType}","${e.entityId || ""}","${e.userEmail || ""}","${details}"`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    setFilterAction("");
    setFilterEntityType("");
    setFilterFrom("");
    setFilterTo("");
    setSearch("");
    setPage(0);
  }

  const activeFilterCount =
    (filterAction ? 1 : 0) + (filterEntityType ? 1 : 0) + (filterFrom ? 1 : 0) + (filterTo ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("audit.title")}
        description={t("audit.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("audit.breadcrumb") },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className="gap-1.5"
            >
              <Filter size={14} />
              Filter
              {activeFilterCount > 0 && (
                <span className="brand-bg ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="gap-1.5"
            >
              <Download size={14} />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadEntries}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Aktualisieren
            </Button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={t("audit.search_placeholder")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-10 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)] focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[color:var(--ds-text)]">Filter</span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
              >
                {t("audit.reset")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                Aktion
              </label>
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              >
                <option value="">Alle Aktionen</option>
                {uniqueActions.map((a) => (
                  <option key={a} value={a}>
                    {auditLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("audit.entity_type")}
              </label>
              <select
                value={filterEntityType}
                onChange={(e) => {
                  setFilterEntityType(e.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              >
                <option value="">Alle Typen</option>
                {uniqueEntityTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                Von
              </label>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                />
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => {
                    setFilterFrom(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                Bis
              </label>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                />
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => {
                    setFilterTo(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="mb-4 flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
        <span>
          {filtered.length} {t("audit.entries_count")}
        </span>
        {filtered.length !== entries.length && (
          <span className="text-[color:var(--ds-text-subtle)]">
            ({entries.length} {t("audit.total_count")})
          </span>
        )}
        {totalPages > 1 && (
          <span>
            Seite {page + 1} von {totalPages}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 size={28} className="brand-text animate-spin" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">Audit-Log wird geladen…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <AlertTriangle size={32} className="text-red-500" />
          <p className="text-sm font-medium text-red-600">Fehler beim Laden</p>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">{error}</p>
          <Button variant="outline" size="sm" onClick={loadEntries} className="mt-2 gap-1.5">
            <RefreshCw size={14} /> Erneut versuchen
          </Button>
        </div>
      ) : pageEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Shield size={40} className="text-[color:var(--ds-text-subtle)]" />
          <p className="text-sm font-medium text-[color:var(--ds-text-muted)]">
            {t("audit.empty_title")}
          </p>
          <p className="max-w-md text-center text-xs text-[color:var(--ds-text-subtle)]">
            {search || activeFilterCount > 0 ? t("audit.empty_filtered") : t("audit.empty_no_data")}
          </p>
          {(search || activeFilterCount > 0) && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-2">
              {t("audit.reset_filters")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                    <th className="px-4 py-3 font-medium">{t("audit.col_time")}</th>
                    <th className="px-4 py-3 font-medium">{t("audit.col_action")}</th>
                    <th className="px-4 py-3 font-medium">{t("audit.col_entity")}</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">
                      {t("audit.col_user")}
                    </th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">
                      {t("audit.col_details")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((e) => {
                    const color = actionColor(e.action);
                    const Icon = actionIcon(e.action);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelectedEntry(e)}
                        className="cursor-pointer border-b border-[color:var(--ds-border)] transition-colors last:border-0 hover:bg-[color:var(--ds-hover)]"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs font-medium text-[color:var(--ds-text)]">
                            {formatTimestamp(lang, e.timestamp)}
                          </div>
                          <div className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)]">
                            {formatRelative(e.timestamp)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                                `bg-${color}-500/10`
                              )}
                            >
                              <Icon size={13} className={cn(`text-${color}-500`)} />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                                {auditLabel(e.action)}
                              </div>
                              <div className="truncate font-mono text-xs text-[color:var(--ds-text-subtle)]">
                                {e.action}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-[color:var(--ds-text-muted)]">
                            {e.entityType || "—"}
                          </div>
                          {e.entityId && (
                            <div className="max-w-[180px] truncate font-mono text-xs text-[color:var(--ds-text-subtle)]">
                              {e.entityId}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          {e.userEmail ? (
                            <span className="block max-w-[180px] truncate text-xs text-[color:var(--ds-text-muted)]">
                              {e.userEmail}
                            </span>
                          ) : (
                            <span className="text-xs text-[color:var(--ds-text-subtle)]">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell">
                          {e.details ? (
                            <span className="block max-w-[240px] truncate font-mono text-xs text-[color:var(--ds-text-subtle)]">
                              {JSON.stringify(e.details).slice(0, 100)}
                            </span>
                          ) : (
                            <span className="text-xs text-[color:var(--ds-text-subtle)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-[color:var(--ds-text-subtle)]">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} von{" "}
                {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="gap-1"
                >
                  <ChevronLeft size={14} /> {t("audit.prev_page")}
                </Button>
                <span className="px-2 text-xs text-[color:var(--ds-text-muted)]">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="gap-1"
                >
                  Weiter <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail drawer */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-6 py-4">
              <h2 className="text-sm font-bold text-[color:var(--ds-text)]">
                Audit-Eintrag Details
              </h2>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  Aktion
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  {(() => {
                    const color = actionColor(selectedEntry.action);
                    const Icon = actionIcon(selectedEntry.action);
                    return (
                      <>
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg",
                            `bg-${color}-500/10`
                          )}
                        >
                          <Icon size={15} className={cn(`text-${color}-500`)} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[color:var(--ds-text)]">
                            {auditLabel(selectedEntry.action)}
                          </div>
                          <div className="font-mono text-xs text-[color:var(--ds-text-subtle)]">
                            {selectedEntry.action}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  Zeitpunkt
                </label>
                <p className="mt-1 text-sm text-[color:var(--ds-text)]">
                  {formatTimestamp(lang, selectedEntry.timestamp)}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)]">
                  {formatRelative(selectedEntry.timestamp)}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  {t("audit.col_entity")}
                </label>
                <div className="mt-1 space-y-1">
                  <p className="text-sm text-[color:var(--ds-text)]">
                    {selectedEntry.entityType || "—"}
                  </p>
                  {selectedEntry.entityId && (
                    <p className="font-mono text-xs break-all text-[color:var(--ds-text-subtle)]">
                      {selectedEntry.entityId}
                    </p>
                  )}
                </div>
              </div>

              {selectedEntry.userEmail && (
                <div>
                  <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                    Benutzer
                  </label>
                  <p className="mt-1 text-sm text-[color:var(--ds-text)]">
                    {selectedEntry.userEmail}
                  </p>
                </div>
              )}

              {selectedEntry.ip && (
                <div>
                  <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                    IP-Adresse
                  </label>
                  <p className="mt-1 font-mono text-sm text-[color:var(--ds-text)]">
                    {selectedEntry.ip}
                  </p>
                </div>
              )}

              {selectedEntry.details && (
                <div>
                  <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                    Details
                  </label>
                  <pre className="mt-1.5 overflow-x-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 font-mono text-xs break-all whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                    {JSON.stringify(selectedEntry.details, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  ID
                </label>
                <p className="mt-1 font-mono text-xs break-all text-[color:var(--ds-text-subtle)]">
                  {selectedEntry.id}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
