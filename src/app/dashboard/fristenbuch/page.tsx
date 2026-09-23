"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Printer,
  CalendarPlus,
  ShieldCheck,
  RotateCcw,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";
import { toLocalIsoDate } from "@/lib/calendar-conflicts";
import { STATUS_TEXT, STATUS_BG, STATUS_BORDER, type StatusColor } from "@/lib/status-colors";
import { type DeadlineStatus } from "@/lib/legal-deadlines";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { useFristen, type Frist } from "@/lib/queries/legal";
import { inTimeWindow, type TimeWindow } from "@/lib/fristenbuch-window";

type FristenbuchEintrag = Frist;

const STATUS_MAP: Record<
  DeadlineStatus,
  { labelKey: DashboardKey; color: StatusColor; icon: React.ElementType }
> = {
  overdue: { labelKey: "deadlines.status_overdue", color: "red", icon: XCircle },
  critical: { labelKey: "deadlines.status_critical", color: "red", icon: AlertTriangle },
  warning: { labelKey: "deadlines.status_warning", color: "amber", icon: AlertTriangle },
  vorfrist: { labelKey: "deadlines.vorfrist_reached", color: "blue", icon: Clock },
  pending: { labelKey: "deadlines.status_pending", color: "emerald", icon: CheckCircle2 },
  done: { labelKey: "deadlines.status_done", color: "emerald", icon: CheckCircle2 },
};

function csvCell(value: string | number | boolean | undefined | null): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function FristenbuchPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { t } = useLang();

  const { data, isLoading: loading, isError, refetch } = useFristen();
  const fristen = useMemo(() => data?.fristen ?? [], [data]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [caseFilter, setCaseFilter] = useState<string>("");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");

  const loadError = isError ? t("deadlines.error_load") : null;

  const caseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of fristen) {
      if (e.case_slug && !map.has(e.case_slug)) {
        map.set(e.case_slug, e.case_title ?? e.case_slug.split("/").pop() ?? e.case_slug);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "de"));
  }, [fristen]);

  const responsibles = useMemo(() => {
    const set = new Set(fristen.map((e) => e.responsible).filter(Boolean) as string[]);
    return [...set].sort((a, b) => a.localeCompare(b, "de"));
  }, [fristen]);

  const filtered = useMemo(() => {
    return fristen.filter((e) => {
      const needle = search.trim().toLowerCase();
      const matchesSearch =
        needle === "" ||
        e.title.toLowerCase().includes(needle) ||
        (e.law ?? "").toLowerCase().includes(needle) ||
        (e.case_title ?? "").toLowerCase().includes(needle) ||
        (e.responsible ?? "").toLowerCase().includes(needle);
      const matchesStatus = filter === "all" || e.status === filter;
      const matchesCase = caseFilter === "" || e.case_slug === caseFilter;
      const matchesResponsible = responsibleFilter === "" || e.responsible === responsibleFilter;
      return (
        matchesSearch &&
        matchesStatus &&
        matchesCase &&
        matchesResponsible &&
        inTimeWindow(e, timeWindow)
      );
    });
  }, [fristen, search, filter, caseFilter, responsibleFilter, timeWindow]);

  // Chronologisch — das Register wird von oben nach unten abgearbeitet.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [filtered]
  );

  const stats = useMemo(() => {
    const open = fristen.filter((e) => e.status !== "done" && e.status !== "completed");
    const days = (e: FristenbuchEintrag) => daysUntil(e.due_date);
    return {
      open: open.length,
      overdue: open.filter((e) => (days(e) ?? 0) < 0).length,
      critical: open.filter((e) => {
        const d = days(e);
        return d !== null && d >= 0 && d <= 3;
      }).length,
      vorfrist: open.filter((e) => e.vorfrist_date && (daysUntil(e.vorfrist_date) ?? 1) <= 0)
        .length,
      byStatus: fristen.reduce<Record<string, number>>((acc, e) => {
        acc[e.status] = (acc[e.status] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }, [fristen]);

  const icsUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/legal/deadlines.ics`
      : "/api/legal/deadlines.ics";

  function loadFristenbuch() {
    void refetch();
  }

  function copyIcsUrl() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(icsUrl);
      addToast({ type: "success", title: t("deadlines.fristenbuch_ics_copied") });
    }
  }

  function exportCsv() {
    if (!sorted.length) return;
    const headers = [
      "Datum",
      "Frist",
      "Akte",
      "Zuständig",
      "Rechtsgrundlage",
      "Status",
      "Vorfrist",
      "Notfrist",
      "Zweitkontrolle durch",
      "Erledigt am",
      "Erledigt von",
      "Quelle",
    ];
    const statusLabel = (status: string) =>
      t((STATUS_MAP[status as DeadlineStatus] ?? STATUS_MAP.pending).labelKey);
    const rows = sorted.map((e) => [
      formatDate(e.due_date),
      e.title,
      e.case_title ?? e.case_slug,
      e.responsible,
      e.law,
      statusLabel(e.status),
      e.vorfrist_date ? formatDate(e.vorfrist_date) : "",
      e.is_notfrist ? "ja" : "nein",
      e.second_check_by,
      e.completed_at ? formatDate(e.completed_at) : "",
      e.completed_by,
      e.source === "legal_case" ? "Akte" : "Fristenbuch",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fristenbuch-${toLocalIsoDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const RESPONSIBLE_COLUMN: Column<FristenbuchEintrag> = {
    key: "responsible",
    header: t("deadlines.fristenbuch_responsible"),
    sortable: true,
    sortAccessor: (e) => e.responsible ?? "",
    hideOnMobile: true,
    width: "w-[1%] whitespace-nowrap",
    cell: (e) => (
      <div className="text-xs">
        <span className="text-[color:var(--ds-text)]">{e.responsible ?? "—"}</span>
        {e.deputy ? (
          <Link
            href="/dashboard/absences"
            onClick={(ev) => ev.stopPropagation()}
            title={t("deadlines.fristenbuch_deputy_link_title")}
            className="block text-[color:var(--ds-text-muted)] underline-offset-2 transition-colors hover:text-[color:var(--brand-primary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          >
            Vertretung: {e.deputy}
          </Link>
        ) : null}
      </div>
    ),
  };

  const columns: Column<FristenbuchEintrag>[] = [
    {
      key: "datum",
      header: t("deadlines.col_date"),
      sortable: true,
      sortAccessor: (e) => e.due_date,
      width: "w-[1%] whitespace-nowrap",
      cell: (e) => {
        const done = e.status === "done" || e.status === "completed";
        const days = daysUntil(e.due_date);
        return (
          <div className="tabular-nums">
            <div
              className={cn(
                "text-sm font-semibold",
                done
                  ? "text-[color:var(--ds-text-muted)]"
                  : days !== null && days < 0
                    ? "text-[color:var(--ds-danger-text)]"
                    : days !== null && days <= 3
                      ? "text-[color:var(--ds-warning-text)]"
                      : "text-[color:var(--ds-text)]"
              )}
            >
              {formatDate(e.due_date)}
            </div>
            <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
              {done ? t("deadlines.status_done") : formatDaysUntil(days)}
            </div>
          </div>
        );
      },
    },
    {
      key: "frist",
      header: t("deadlines.col_title"),
      sortable: true,
      sortAccessor: (e) => e.title,
      width: "w-full max-w-0",
      cell: (e) => {
        const meta = [
          e.case_title ?? (e.case_slug ? e.case_slug.split("/").pop() : null),
          e.law,
          e.vorfrist_date ? `Vorfrist ${formatDate(e.vorfrist_date)}` : null,
        ].filter(Boolean);
        return (
          <div className="min-w-0">
            <div className="line-clamp-2 font-medium text-[color:var(--ds-text)]" title={e.title}>
              {e.title}
            </div>
            {meta.length > 0 && (
              <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
                {meta.join(" · ")}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: t("deadlines.col_status"),
      sortable: true,
      sortAccessor: (e) => e.status,
      width: "w-[1%] whitespace-nowrap",
      cell: (e) => {
        const cfg =
          STATUS_MAP[(e.status === "completed" ? "done" : e.status) as DeadlineStatus] ||
          STATUS_MAP.pending;
        const done = e.status === "done" || e.status === "completed";
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge
              variant="default"
              className={cn(
                "border text-xs whitespace-nowrap",
                STATUS_BG[cfg.color],
                STATUS_BORDER[cfg.color],
                STATUS_TEXT[cfg.color]
              )}
            >
              {t(cfg.labelKey)}
            </Badge>
            {e.is_notfrist && (
              <Badge
                variant="default"
                className="flex items-center gap-0.5 border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs whitespace-nowrap text-[color:var(--ds-danger-text)]"
              >
                <ShieldCheck size={10} aria-hidden="true" />
                {t("deadlines.notfrist")}
              </Badge>
            )}
            {done && (e.completed_at || e.completed_by) && (
              <span className="text-xs whitespace-nowrap text-[color:var(--ds-text-muted)]">
                {[e.completed_at ? formatDate(e.completed_at) : null, e.completed_by]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  // Zuständigkeit nur zeigen, wenn überhaupt jemand eingetragen ist.
  if (responsibles.length > 0) {
    columns.splice(2, 0, RESPONSIBLE_COLUMN);
  }

  const hasFilters =
    filter !== "all" ||
    caseFilter !== "" ||
    responsibleFilter !== "" ||
    timeWindow !== "all" ||
    search !== "";

  const statusChips = (
    [
      ["overdue", "deadlines.status_overdue"],
      ["critical", "deadlines.status_critical"],
      ["warning", "deadlines.status_warning"],
      ["vorfrist", "deadlines.vorfrist_reached"],
      ["pending", "deadlines.status_pending"],
      ["done", "deadlines.status_done"],
    ] as const
  )
    .map(([key, labelKey]) => ({ key, labelKey, count: stats.byStatus[key] ?? 0 }))
    .filter((c) => c.count > 0 || filter === c.key);

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8" data-tour="fristenbuch">
      <PageHeader
        title={t("deadlines.fristenbuch")}
        description="Das Fristenbuch der Kanzlei: alle Fristen chronologisch, mit Zuständigkeit und Erledigungsvermerk — zum Ausdrucken für die tägliche Fristenkontrolle."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("deadlines.title"), href: "/dashboard/deadlines" },
          { label: t("deadlines.fristenbuch") },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportCsv}
              disabled={!sorted.length}
              className="gap-2 whitespace-nowrap"
            >
              <Download size={14} />
              {t("deadlines.fristenbuch_csv")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyIcsUrl}
              className="gap-2 whitespace-nowrap"
            >
              <CalendarPlus size={14} />
              Kalender-Abo kopieren
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
              className="gap-2 whitespace-nowrap"
            >
              <Printer size={14} />
              {t("deadlines.fristenbuch_print")}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] lg:grid-cols-4 print:border-none">
        {[
          { label: "Offen", value: stats.open, tone: "text-[color:var(--ds-text)]" },
          {
            label: t("deadlines.status_overdue"),
            value: stats.overdue,
            tone: "text-[color:var(--ds-danger-text)]",
          },
          {
            label: "In den nächsten 3 Tagen",
            value: stats.critical,
            tone: "text-[color:var(--ds-warning-text)]",
          },
          {
            label: t("deadlines.vorfrist_reached"),
            value: stats.vorfrist,
            tone: "text-[color:var(--ds-info-text)]",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[color:var(--ds-surface)] px-4 py-3 print:border print:border-[color:var(--ds-border)]"
          >
            <div className="text-xs text-[color:var(--ds-text-muted)]">{item.label}</div>
            <div
              className={cn(
                "mt-1 text-2xl leading-none font-semibold tabular-nums",
                item.value > 0 ? item.tone : "text-[color:var(--ds-text)]"
              )}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {(stats.overdue > 0 || stats.critical > 0) && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 print:hidden"
        >
          <AlertTriangle size={18} className="shrink-0 text-[color:var(--ds-danger-text)]" />
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            {[
              stats.overdue > 0
                ? `${stats.overdue} ${stats.overdue === 1 ? "Frist ist überfällig" : "Fristen sind überfällig"}`
                : null,
              stats.critical > 0
                ? `${stats.critical} ${stats.critical === 1 ? "Frist endet" : "Fristen enden"} in den nächsten 3 Tagen`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}

      {statusChips.length > 1 && (
        <div className="filter-strip print:hidden">
          <FilterChip
            label={t("deadlines.all")}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {statusChips.map((c) => (
            <FilterChip
              key={c.key}
              label={c.count > 0 ? `${t(c.labelKey)} (${c.count})` : t(c.labelKey)}
              active={filter === c.key}
              onClick={() => setFilter(filter === c.key ? "all" : c.key)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <SearchBar
          placeholder={t("deadlines.fristenbuch_search")}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          className="w-full sm:max-w-md"
        />
        <select
          value={timeWindow}
          onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}
          aria-label={t("deadlines.fristenbuch_window_all")}
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 sm:w-auto"
        >
          <option value="all">{t("deadlines.fristenbuch_window_all")}</option>
          <option value="today">{t("deadlines.fristenbuch_window_today")}</option>
          <option value="7">{t("deadlines.fristenbuch_window_7")}</option>
          <option value="14">{t("deadlines.fristenbuch_window_14")}</option>
        </select>
        {responsibles.length > 0 && (
          <select
            value={responsibleFilter}
            onChange={(e) => setResponsibleFilter(e.target.value)}
            aria-label={t("deadlines.fristenbuch_responsible")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 sm:w-auto"
          >
            <option value="">{t("deadlines.fristenbuch_all_responsible")}</option>
            {responsibles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        {caseOptions.length > 0 && (
          <select
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
            aria-label={t("deadlines.col_case")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 sm:w-auto"
          >
            <option value="">{t("deadlines.fristenbuch_all_cases")}</option>
            {caseOptions.map(([slug, title]) => (
              <option key={slug} value={slug}>
                {title}
              </option>
            ))}
          </select>
        )}
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)] print:hidden">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadFristenbuch()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} />
            {t("deadlines.retry")}
          </Button>
        </div>
      )}

      {!(loadError && fristen.length === 0) && (
        <DataTable
          density="dense"
          columns={columns}
          data={sorted}
          loading={loading}
          emptyTitle={
            hasFilters ? "Keine Fristen für diese Auswahl" : t("deadlines.fristenbuch_empty")
          }
          emptyDescription={
            hasFilters
              ? t("deadlines.empty_filtered")
              : "Fristen, die Sie in Akten oder unter Fristen erfassen, erscheinen hier chronologisch."
          }
          emptyIcon={BookOpen}
          emptyActionLabel={hasFilters ? "Filter zurücksetzen" : "Zu den Fristen"}
          onEmptyAction={() => {
            if (hasFilters) {
              setFilter("all");
              setCaseFilter("");
              setResponsibleFilter("");
              setTimeWindow("all");
              setSearch("");
            } else {
              router.push("/dashboard/deadlines");
            }
          }}
          onRowClick={(e) =>
            e.case_slug ? router.push(`/dashboard/cases/${encodeSlugPath(e.case_slug)}`) : undefined
          }
          rowKey={(e) => e.id}
          pageSize={50}
        />
      )}

      <div className="hidden print:block">
        <p className="mt-4 border-t border-[color:var(--ds-border)] pt-2 text-xs text-[color:var(--ds-text-muted)]">
          {t("deadlines.fristenbuch_print_footer")}: {formatDate(new Date())} — {sorted.length}{" "}
          Fristen
          {timeWindow !== "all" &&
            ` · ${t(
              timeWindow === "today"
                ? "deadlines.fristenbuch_window_today"
                : timeWindow === "7"
                  ? "deadlines.fristenbuch_window_7"
                  : "deadlines.fristenbuch_window_14"
            )}`}
          {responsibleFilter &&
            ` · ${t("deadlines.fristenbuch_responsible")}: ${responsibleFilter}`}
        </p>
      </div>
    </div>
  );
}
