"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("de-DE", {
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
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set("action", filterAction);
      if (filterEntityType) params.set("entityType", filterEntityType);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      params.set("limit", "500");
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: AuditEntry[] };
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterEntityType, filterFrom, filterTo]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

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
    [entries],
  );
  const uniqueEntityTypes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entityType).filter(Boolean))).sort(),
    [entries],
  );

  function exportCsv() {
    const lines = [
      "timestamp,action,label,entityType,entityId,userEmail,details",
      ...filtered.map((e) => {
        const ts = new Date(e.timestamp).toISOString();
        const label = auditLabel(e.action);
        const details = e.details ? JSON.stringify(e.details).replace(/,/g, ";").replace(/"/g, "'") : "";
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
    (filterAction ? 1 : 0) +
    (filterEntityType ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Audit-Log"
        description="Vollständige Nachvollziehbarkeit aller Aktionen im Kanzlei-Workspace — GoBD-konform protokolliert."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit-Log" }]}
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
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full brand-bg text-white text-[10px] font-bold">
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
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Audit-Log durchsuchen — Aktion, Entität, Benutzer, Details…"
            className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg pl-10 pr-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 p-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[color:var(--ds-text)]">Filter</span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] transition-colors"
              >
                Zurücksetzen
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[color:var(--ds-text-muted)] mb-1.5">Aktion</label>
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
                className="w-full bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
              >
                <option value="">Alle Aktionen</option>
                {uniqueActions.map((a) => (
                  <option key={a} value={a}>{auditLabel(a)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--ds-text-muted)] mb-1.5">Entitätstyp</label>
              <select
                value={filterEntityType}
                onChange={(e) => { setFilterEntityType(e.target.value); setPage(0); }}
                className="w-full bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
              >
                <option value="">Alle Typen</option>
                {uniqueEntityTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--ds-text-muted)] mb-1.5">Von</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => { setFilterFrom(e.target.value); setPage(0); }}
                  className="w-full bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--ds-text-muted)] mb-1.5">Bis</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => { setFilterTo(e.target.value); setPage(0); }}
                  className="w-full bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 text-xs text-[color:var(--ds-text-muted)]">
        <span>{filtered.length} Einträge</span>
        {filtered.length !== entries.length && (
          <span className="text-[color:var(--ds-text-subtle)]">({entries.length} gesamt)</span>
        )}
        {totalPages > 1 && (
          <span>Seite {page + 1} von {totalPages}</span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 size={28} className="brand-text animate-spin" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">Audit-Log wird geladen…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <AlertTriangle size={32} className="text-red-500" />
          <p className="text-sm text-red-600 font-medium">Fehler beim Laden</p>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">{error}</p>
          <Button variant="outline" size="sm" onClick={loadEntries} className="mt-2 gap-1.5">
            <RefreshCw size={14} /> Erneut versuchen
          </Button>
        </div>
      ) : pageEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Shield size={40} className="text-[color:var(--ds-text-subtle)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)] font-medium">Keine Audit-Einträge gefunden</p>
          <p className="text-xs text-[color:var(--ds-text-subtle)] max-w-md text-center">
            {search || activeFilterCount > 0
              ? "Mit den aktuellen Filtern wurden keine Einträge gefunden. Versuche die Filter anzupassen."
              : "Audit-Logs werden automatisch erstellt, sobald Aktionen im Dashboard ausgeführt werden."}
          </p>
          {(search || activeFilterCount > 0) && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-2">
              Filter zurücksetzen
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--ds-text-subtle)] uppercase tracking-wider border-b border-[color:var(--ds-border)]">
                    <th className="px-4 py-3 font-medium">Zeitpunkt</th>
                    <th className="px-4 py-3 font-medium">Aktion</th>
                    <th className="px-4 py-3 font-medium">Entität</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Benutzer</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Details</th>
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
                        className="border-b border-[color:var(--ds-border)] last:border-0 hover:bg-[color:var(--ds-hover)] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs text-[color:var(--ds-text)] font-medium">
                            {formatTimestamp(e.timestamp)}
                          </div>
                          <div className="text-[10px] text-[color:var(--ds-text-subtle)] mt-0.5">
                            {formatRelative(e.timestamp)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", `bg-${color}-500/10`)}>
                              <Icon size={13} className={cn(`text-${color}-500`)} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[color:var(--ds-text)] truncate">
                                {auditLabel(e.action)}
                              </div>
                              <div className="text-[10px] text-[color:var(--ds-text-subtle)] font-mono truncate">
                                {e.action}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-[color:var(--ds-text-muted)]">{e.entityType || "—"}</div>
                          {e.entityId && (
                            <div className="text-[10px] text-[color:var(--ds-text-subtle)] font-mono truncate max-w-[180px]">
                              {e.entityId}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {e.userEmail ? (
                            <span className="text-xs text-[color:var(--ds-text-muted)] truncate block max-w-[180px]">
                              {e.userEmail}
                            </span>
                          ) : (
                            <span className="text-xs text-[color:var(--ds-text-subtle)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {e.details ? (
                            <span className="text-xs text-[color:var(--ds-text-subtle)] font-mono truncate block max-w-[240px]">
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
            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-[color:var(--ds-text-subtle)]">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} von {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="gap-1"
                >
                  <ChevronLeft size={14} /> Zurück
                </Button>
                <span className="text-xs text-[color:var(--ds-text-muted)] px-2">
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
          className="fixed inset-0 bg-black/60 z-50 flex justify-end"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="w-full max-w-md bg-[color:var(--ds-surface)] border-l border-[color:var(--ds-border)] h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[color:var(--ds-surface)] border-b border-[color:var(--ds-border)] px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[color:var(--ds-text)]">Audit-Eintrag Details</h2>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs font-medium text-[color:var(--ds-text-subtle)] uppercase tracking-wider">Aktion</label>
                <div className="mt-1.5 flex items-center gap-2">
                  {(() => {
                    const color = actionColor(selectedEntry.action);
                    const Icon = actionIcon(selectedEntry.action);
                    return (
                      <>
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", `bg-${color}-500/10`)}>
                          <Icon size={15} className={cn(`text-${color}-500`)} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[color:var(--ds-text)]">{auditLabel(selectedEntry.action)}</div>
                          <div className="text-xs text-[color:var(--ds-text-subtle)] font-mono">{selectedEntry.action}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[color:var(--ds-text-subtle)] uppercase tracking-wider">Zeitpunkt</label>
                <p className="mt-1 text-sm text-[color:var(--ds-text)]">{formatTimestamp(selectedEntry.timestamp)}</p>
                <p className="text-xs text-[color:var(--ds-text-subtle)] mt-0.5">{formatRelative(selectedEntry.timestamp)}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-[color:var(--ds-text-subtle)] uppercase tracking-wider">Entität</label>
                <div className="mt-1 space-y-1">
                  <p className="text-sm text-[color:var(--ds-text)]">{selectedEntry.entityType || "—"}</p>
                  {selectedEntry.entityId && (
                    <p className="text-xs text-[color:var(--ds-text-subtle)] font-mono break-all">{selectedEntry.entityId}</p>
                  )}
                </div>
              </div>

              {selectedEntry.userEmail && (
                <div>
                  <label className="text-xs font-medium text-[color:var(--ds-text-subtle)] uppercase tracking-wider">Benutzer</label>
                  <p className="mt-1 text-sm text-[color:var(--ds-text)]">{selectedEntry.userEmail}</p>
                </div>
              )}

              {selectedEntry.ip && (
                <div>
                  <label className="text-xs font-medium text-[color:var(--ds-text-subtle)] uppercase tracking-wider">IP-Adresse</label>
                  <p className="mt-1 text-sm text-[color:var(--ds-text)] font-mono">{selectedEntry.ip}</p>
                </div>
              )}

              {selectedEntry.details && (
                <div>
                  <label className="text-xs font-medium text-[color:var(--ds-text-subtle)] uppercase tracking-wider">Details</label>
                  <pre className="mt-1.5 p-3 rounded-lg bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] text-xs text-[color:var(--ds-text-muted)] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedEntry.details, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-[color:var(--ds-text-subtle)] uppercase tracking-wider">ID</label>
                <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)] font-mono break-all">{selectedEntry.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
