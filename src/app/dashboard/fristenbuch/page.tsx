"use client";

import { useMemo, useState } from "react";
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
import { cn, encodeSlugPath } from "@/lib/utils";
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

type FristenbuchEintrag = Frist;

interface FristenbuchSummary {
  gesamt: number;
  overdue: number;
  critical: number;
  warning: number;
  vorfrist: number;
  pending: number;
  done: number;
  completed?: number;
}

const STATUS_MAP: Record<
  DeadlineStatus,
  { labelKey: DashboardKey; color: StatusColor; icon: React.ElementType }
> = {
  overdue: { labelKey: "deadlines.status_overdue", color: "rose", icon: XCircle },
  critical: { labelKey: "deadlines.status_critical", color: "red", icon: AlertTriangle },
  warning: { labelKey: "deadlines.status_warning", color: "amber", icon: AlertTriangle },
  vorfrist: { labelKey: "deadlines.vorfrist_reached", color: "blue", icon: Clock },
  pending: { labelKey: "deadlines.status_pending", color: "emerald", icon: CheckCircle2 },
  done: { labelKey: "deadlines.status_done", color: "emerald", icon: CheckCircle2 },
};

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  target.setUTCHours(0, 0, 0, 0);
  now.setUTCHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function FristenbuchPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { t, lang } = useLang();

  const { data, isLoading: loading, isError, refetch } = useFristen();
  const fristen = useMemo(() => data?.fristen ?? [], [data]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [caseFilter, setCaseFilter] = useState<string>("");

  const loadError = isError ? t("deadlines.error_load") : null;

  const caseSlugs = useMemo(() => {
    const set = new Set(fristen.map((e) => e.case_slug).filter(Boolean) as string[]);
    return [...set].sort();
  }, [fristen]);

  const filtered = useMemo(() => {
    return fristen.filter((e) => {
      const matchesSearch =
        search === "" ||
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.law ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (e.case_slug ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filter === "all" || e.status === filter;
      const matchesCase = caseFilter === "" || e.case_slug === caseFilter;
      return matchesSearch && matchesStatus && matchesCase;
    });
  }, [fristen, search, filter, caseFilter]);

  const stats: FristenbuchSummary = data?.zusammenfassung ?? {
    gesamt: 0,
    overdue: 0,
    critical: 0,
    warning: 0,
    vorfrist: 0,
    pending: 0,
    done: 0,
    completed: 0,
  };

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
    if (!filtered.length) return;
    const headers = [
      "Datum",
      "Frist",
      "Aktenzeichen",
      "Rechtsgrundlage",
      "Folge bei Versäumnis",
      "Beleg",
      "Status",
      "Vorfrist",
      "Eskalation",
    ];
    const rows = filtered.map((e) => [
      e.due_date,
      `"${e.title.replace(/"/g, '""')}"`,
      e.case_slug ?? "",
      `"${(e.law ?? "").replace(/"/g, '""')}"`,
      `""`,
      `""`,
      e.status,
      e.vorfrist_date ?? "",
      e.is_notfrist ? "ja" : "nein",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fristenbuch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<FristenbuchEintrag>[] = [
    {
      key: "datum",
      header: t("deadlines.col_date"),
      sortable: true,
      sortAccessor: (e) => e.due_date,
      width: "120px",
      cell: (e) => {
        const days = getDaysUntil(e.due_date);
        return (
          <div className="text-right">
            <div
              className={cn(
                "text-sm font-semibold tabular-nums",
                days < 0
                  ? "text-[color:var(--ds-danger-text)]"
                  : days <= 3
                    ? "text-[color:var(--ds-warning-text)]"
                    : "text-[color:var(--ds-text)]"
              )}
            >
              {new Date(e.due_date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
            </div>
            <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
              {days < 0
                ? `${Math.abs(days)} ${t("deadlines.days_overdue")}`
                : days === 0
                  ? t("deadlines.today")
                  : days === 1
                    ? t("deadlines.tomorrow")
                    : `${t("deadlines.in_days")} ${days} ${t("deadlines.days")}`}
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
      cell: (e) => {
        const cfg = STATUS_MAP[e.status as DeadlineStatus] || STATUS_MAP.pending;
        const StatusIcon = cfg.icon;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                STATUS_BG[cfg.color],
                STATUS_BORDER[cfg.color]
              )}
              aria-hidden="true"
            >
              <StatusIcon size={16} className={STATUS_TEXT[cfg.color]} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-[color:var(--ds-text)]">{e.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {e.law && (
                  <Badge
                    variant="default"
                    className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {e.law}
                  </Badge>
                )}
                {e.is_notfrist && (
                  <Badge
                    variant="default"
                    className="flex items-center gap-0.5 border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-xs text-[color:var(--ds-warning-text)]"
                  >
                    <ShieldCheck size={10} />
                    {t("deadlines.second_check")}
                  </Badge>
                )}
                {e.vorfrist_date && (
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("deadlines.fristenbuch_vorfrist")}:{" "}
                    {new Date(e.vorfrist_date).toLocaleDateString(
                      lang === "en" ? "en-GB" : "de-DE"
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "case_slug",
      header: t("deadlines.col_case"),
      sortable: true,
      sortAccessor: (e) => e.case_slug ?? "",
      hideOnMobile: true,
      cell: (e) =>
        e.case_slug ? (
          <button
            onClick={() => router.push(`/dashboard/cases/${encodeSlugPath(e.case_slug!)}`)}
            className="text-xs text-[color:var(--brand-primary)] hover:underline"
          >
            {e.case_slug}
          </button>
        ) : (
          <span className="text-xs text-[color:var(--ds-text-muted)]">—</span>
        ),
    },
    {
      key: "folge",
      header: t("deadlines.fristenbuch_folge"),
      hideOnMobile: true,
      cell: (e) => (
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          {e.source === "fristenbuch"
            ? "Fristenbuch"
            : e.source === "legal_deadline"
              ? "Fristenseite"
              : e.source === "legal_case"
                ? "Akte"
                : "Timeline"}
        </span>
      ),
    },
    {
      key: "status",
      header: t("deadlines.col_status"),
      sortable: true,
      sortAccessor: (e) => e.status,
      width: "120px",
      cell: (e) => {
        const cfg = STATUS_MAP[e.status as DeadlineStatus] || STATUS_MAP.pending;
        return (
          <Badge
            variant="default"
            className={cn(
              "border text-xs",
              STATUS_BG[cfg.color],
              STATUS_BORDER[cfg.color],
              STATUS_TEXT[cfg.color]
            )}
          >
            {t(cfg.labelKey)}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8" data-tour="fristenbuch">
      <PageHeader
        title={t("deadlines.fristenbuch")}
        description={t("deadlines.fristenbuch_desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("deadlines.fristenbuch") },
        ]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.print()}
              className="gap-2 text-xs"
            >
              <Printer size={14} />
              {t("deadlines.fristenbuch_print")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportCsv}
              disabled={!filtered.length}
              className="gap-2 text-xs"
            >
              <Download size={14} />
              {t("deadlines.fristenbuch_csv")}
            </Button>
            <Button variant="ghost" size="sm" onClick={copyIcsUrl} className="gap-2 text-xs">
              <CalendarPlus size={14} />
              {t("deadlines.fristenbuch_ics")}
            </Button>
          </div>
        }
      />

      <div className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] sm:grid-cols-3 lg:grid-cols-5 print:border-none">
        {[
          {
            label: t("deadlines.fristenbuch_gesamt"),
            value: stats.gesamt,
            color: "text-[color:var(--ds-text)]",
          },
          {
            label: t("deadlines.status_overdue"),
            value: stats.overdue,
            color: "text-[color:var(--ds-danger-text)]",
          },
          {
            label: t("deadlines.status_critical"),
            value: stats.critical,
            color: "text-[color:var(--ds-danger-text)]",
          },
          {
            label: t("deadlines.vorfrist_reached"),
            value: stats.vorfrist,
            color: "text-[color:var(--ds-info-text)]",
          },
          {
            label: t("deadlines.fristenbuch_ok"),
            value: stats.pending,
            color: "text-[color:var(--ds-success-text)]",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[color:var(--ds-surface)] px-4 py-3 print:border print:border-[color:var(--ds-border)]"
          >
            <div className="text-xs text-[color:var(--ds-text-muted)]">{item.label}</div>
            <div
              className={cn("mt-1 text-2xl leading-none font-semibold tabular-nums", item.color)}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {(stats.overdue > 0 || stats.critical > 0) && (
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 print:hidden">
          <AlertTriangle size={18} className="shrink-0 text-[color:var(--ds-danger-text)]" />
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            {stats.overdue > 0 && `${stats.overdue} ${t("deadlines.alert_critical_plural")} `}
            {stats.critical > 0 && `${stats.critical} ${t("deadlines.fristenbuch_kritisch_hint")}`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <FilterChip
          label={t("deadlines.all")}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {(
          [
            ["overdue", "deadlines.status_overdue"],
            ["critical", "deadlines.status_critical"],
            ["warning", "deadlines.status_warning"],
            ["vorfrist", "deadlines.vorfrist_reached"],
            ["pending", "deadlines.fristenbuch_ok"],
          ] as const
        ).map(([key, labelKey]) => {
          const count =
            key === "overdue"
              ? stats.overdue
              : key === "critical"
                ? stats.critical
                : key === "warning"
                  ? stats.warning
                  : key === "vorfrist"
                    ? stats.vorfrist
                    : stats.pending;
          if (count === 0) return null;
          return (
            <FilterChip
              key={key}
              label={`${t(labelKey)} (${count})`}
              active={filter === key}
              onClick={() => setFilter(filter === key ? "all" : key)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <SearchBar
          placeholder={t("deadlines.fristenbuch_search")}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          className="max-w-md"
        />
        {caseSlugs.length > 0 && (
          <select
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          >
            <option value="">{t("deadlines.fristenbuch_all_cases")}</option>
            {caseSlugs.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
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

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle={t("deadlines.fristenbuch_empty")}
        emptyDescription={
          loading ? t("deadlines.fristenbuch_loading") : t("deadlines.empty_filtered")
        }
        emptyIcon={BookOpen}
        onRowClick={(e) =>
          e.case_slug ? router.push(`/dashboard/cases/${encodeSlugPath(e.case_slug)}`) : undefined
        }
        rowKey={(e) => e.id}
        pageSize={50}
      />

      <div className="hidden print:block">
        <p className="mt-4 border-t border-[color:var(--ds-border)] pt-2 text-xs text-[color:var(--ds-text-muted)]">
          {t("deadlines.fristenbuch_print_footer")}:{" "}
          {new Date().toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")} — {stats.gesamt}{" "}
          {t("deadlines.count")}
        </p>
      </div>
    </div>
  );
}
