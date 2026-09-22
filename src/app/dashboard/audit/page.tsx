"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Shield,
  Search,
  Calendar,
  Clock,
  FileText,
  User,
  AlertTriangle,
  CheckCircle2,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/dashboard/skeleton";
import { auditLabel, type AuditEntry } from "@/lib/audit-labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { useApiQuery } from "@/lib/use-api-query";
import type { Lang } from "@/content/site";

const PAGE_SIZE = 25;

/** Anwaltsverständliche Bezeichnung für den betroffenen Datensatz. */
const ENTITY_LABELS: Record<string, string> = {
  act_import_session: "Aktenübernahme",
  agent_action: "Assistent-Vorschlag",
  api_key: "Zugangsschlüssel",
  backup: "Datensicherung",
  bank_transaction: "Bankbuchung",
  billing: "Abrechnung",
  case: "Akte",
  client_submission: "Mandanten-Einreichung",
  conflict_check: "Kollisionsprüfung",
  connector: "Verbindung",
  contract: "Vertrag",
  deadline: "Frist",
  document: "Dokument",
  document_request: "Unterlagenanforderung",
  email_message: "E-Mail",
  intake_request: "Mandatsanfrage",
  invoice: "Rechnung",
  judgement: "Entscheidung",
  legal_case: "Akte",
  legal_deadline: "Frist",
  mail_account: "E-Mail-Konto",
  notification: "Benachrichtigung",
  org: "Team",
  page: "Eintrag im Kanzleiwissen",
  person: "Person",
  plan: "Tarif",
  playbook: "Prüfleitfaden",
  portal_token: "Mandantenportal-Zugang",
  power_of_attorney: "Vollmacht",
  presence: "Anwesenheit",
  review_set: "Prüfset",
  search: "Suche",
  template: "Vorlage",
  time_entry: "Zeiteintrag",
  trust_account: "Anderkonto",
  user: "Benutzer",
  webhook: "Webhook",
  workflow: "Ablauf",
  work_product: "Arbeitsergebnis",
};

function entityLabel(type: string | undefined | null): string {
  if (!type) return "—";
  return ENTITY_LABELS[type] ?? "Sonstiger Datensatz";
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
  if (action.startsWith("legal.")) return FileText;
  if (action.startsWith("data.")) return Download;
  return Clock;
}

function formatTimestamp(lang: Lang, ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return formatDateTime(ts);
  return d.toLocaleString(lang === "en" ? "en-GB" : "de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(ts: string): string {
  try {
    const time = new Date(ts).getTime();
    if (Number.isNaN(time)) return "";
    const diff = Date.now() - time;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "gerade eben";
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
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

  // A11y for the detail drawer: autofocus on open, focus restoration on
  // close. Self-contained — the global dashboard focus trap only covers
  // layout-registered overlays.
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!selectedEntry) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => drawerCloseRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, [selectedEntry]);

  // Keyboard handling for the detail drawer: Escape closes, Tab cycles focus
  // within the dialog.
  useEffect(() => {
    if (!selectedEntry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedEntry(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = drawerRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedEntry]);

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
    if (!res.ok) {
      throw new Error(
        res.status === 403
          ? "Sie haben keine Berechtigung, das Protokoll einzusehen."
          : "Das Protokoll konnte nicht geladen werden. Bitte versuchen Sie es in einem Moment erneut."
      );
    }
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
        entityLabel(e.entityType).toLowerCase().includes(s) ||
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
      "Zeitpunkt,Aktion,Bezeichnung,Datensatz,Kennung,Benutzer,Angaben",
      ...filtered.map((e) => {
        const ts = new Date(e.timestamp).toISOString();
        const label = auditLabel(e.action);
        const details = e.details
          ? JSON.stringify(e.details).replace(/,/g, ";").replace(/"/g, "'")
          : "";
        return `"${ts}","${e.action}","${label}","${entityLabel(e.entityType)}","${e.entityId || ""}","${e.userEmail || ""}","${details}"`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `protokoll-${new Date().toISOString().split("T")[0]}.csv`;
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
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
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
              aria-expanded={showFilters}
              className="gap-1.5 whitespace-nowrap"
            >
              <Filter size={14} aria-hidden />
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
              title="Die gefilterten Einträge als Tabelle (CSV) herunterladen"
              className="gap-1.5 whitespace-nowrap"
            >
              <Download size={14} aria-hidden />
              Exportieren
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadEntries}
              disabled={loading}
              className="gap-1.5 whitespace-nowrap"
            >
              <RefreshCw size={14} aria-hidden className={loading ? "animate-spin" : ""} />
              Aktualisieren
            </Button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            aria-hidden
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
            aria-label="Protokoll durchsuchen"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-10 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Suche leeren"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[color:var(--ds-text)]">Filter</span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs text-[color:var(--ds-text-subtle)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
              >
                {t("audit.reset")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="audit-filter-action"
                className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]"
              >
                Aktion
              </label>
              <select
                id="audit-filter-action"
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              >
                <option value="">Alle Aktionen</option>
                {uniqueActions.map((a) => (
                  <option key={a} value={a} title={a}>
                    {auditLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="audit-filter-entity"
                className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]"
              >
                {t("audit.entity_type")}
              </label>
              <select
                id="audit-filter-entity"
                value={filterEntityType}
                onChange={(e) => {
                  setFilterEntityType(e.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              >
                <option value="">Alle Datensätze</option>
                {uniqueEntityTypes.map((type) => (
                  <option key={type} value={type}>
                    {entityLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="audit-filter-from"
                className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]"
              >
                Von
              </label>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                />
                <input
                  id="audit-filter-from"
                  type="date"
                  value={filterFrom}
                  onChange={(e) => {
                    setFilterFrom(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="audit-filter-to"
                className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]"
              >
                Bis
              </label>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                />
                <input
                  id="audit-filter-to"
                  type="date"
                  value={filterTo}
                  onChange={(e) => {
                    setFilterTo(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--ds-text-muted)]">
        <span className="tabular-nums">
          {filtered.length} {t("audit.entries_count")}
        </span>
        {entries.length >= 500 && (
          <span className="text-[color:var(--ds-text-subtle)]">
            Angezeigt werden die neuesten 500 Einträge — grenzen Sie den Zeitraum über den Filter
            ein, um ältere Einträge zu sehen.
          </span>
        )}
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
        <div
          className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
          role="status"
          aria-label="Protokoll wird geladen"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-6 border-b border-[color:var(--ds-border)] px-4 py-3.5 last:border-0"
            >
              <Skeleton className="h-3.5 w-32 rounded" />
              <Skeleton className="h-3.5 w-40 rounded" />
              <Skeleton className="hidden h-3.5 w-24 rounded md:block" />
              <Skeleton className="hidden h-3.5 w-44 rounded lg:block" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-16 text-center"
        >
          <AlertTriangle size={28} aria-hidden className="text-[color:var(--ds-danger-text)]" />
          <p className="text-sm font-medium text-[color:var(--ds-text)]">
            Das Protokoll konnte nicht geladen werden
          </p>
          <p className="max-w-md text-xs text-[color:var(--ds-text-muted)]">
            {error.startsWith("Sie haben") || error.startsWith("Das Protokoll")
              ? error
              : "Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut."}
          </p>
          <Button variant="outline" size="sm" onClick={loadEntries} className="mt-2 gap-1.5">
            <RefreshCw size={14} /> Erneut versuchen
          </Button>
        </div>
      ) : pageEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] py-16">
          <Shield size={32} aria-hidden className="text-[color:var(--ds-text-subtle)]" />
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
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((e) => {
                    const Icon = actionIcon(e.action);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelectedEntry(e)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            setSelectedEntry(e);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`${auditLabel(e.action)}, ${formatTimestamp(lang, e.timestamp)} — Details öffnen`}
                        className="cursor-pointer border-b border-[color:var(--ds-border)] transition-[background-color,border-color,color] last:border-0 hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs font-medium text-[color:var(--ds-text)] tabular-nums">
                            {formatTimestamp(lang, e.timestamp)}
                          </div>
                          <div className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)]">
                            {formatRelative(e.timestamp)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
                              <Icon
                                size={13}
                                aria-hidden
                                className="text-[color:var(--ds-text-muted)]"
                              />
                            </div>
                            <div className="min-w-0">
                              {/* Rohe Aktions-ID nur als Tooltip; sichtbar nur, wenn kein Label existiert. */}
                              <div
                                className="truncate text-xs font-medium text-[color:var(--ds-text)]"
                                title={e.action}
                              >
                                {auditLabel(e.action)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="text-xs text-[color:var(--ds-text-muted)]"
                            title={e.entityType || undefined}
                          >
                            {entityLabel(e.entityType)}
                          </div>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
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
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via Escape or the close button.
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[color:var(--ds-text)]/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedEntry(null);
          }}
        >
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-entry-detail-title"
            className="h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-6 py-4">
              <h2
                id="audit-entry-detail-title"
                className="text-sm font-bold text-[color:var(--ds-text)]"
              >
                Eintrag im Protokoll
              </h2>
              <button
                ref={drawerCloseRef}
                onClick={() => setSelectedEntry(null)}
                aria-label={t("common.close")}
                className="text-[color:var(--ds-text-subtle)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
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
                    const Icon = actionIcon(selectedEntry.action);
                    return (
                      <>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
                          <Icon
                            size={15}
                            aria-hidden
                            className="text-[color:var(--ds-text-muted)]"
                          />
                        </div>
                        <div>
                          <div
                            className="text-sm font-medium text-[color:var(--ds-text)]"
                            title={selectedEntry.action}
                          >
                            {auditLabel(selectedEntry.action)}
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
                    {entityLabel(selectedEntry.entityType)}
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
                <details>
                  <summary className="cursor-pointer text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                    Technische Angaben
                  </summary>
                  <p className="mt-1.5 text-xs text-[color:var(--ds-text-muted)]">
                    Vom System gespeicherte Rohdaten zu diesem Vorgang, unverändert für
                    Nachweiszwecke.
                  </p>
                  <pre className="mt-1.5 overflow-x-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 font-mono text-xs break-all whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                    {JSON.stringify(selectedEntry.details, null, 2)}
                  </pre>
                </details>
              )}

              <div>
                <label className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  Kennung des Eintrags
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
