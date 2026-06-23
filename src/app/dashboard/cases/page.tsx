"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Plus,
  Scale,
  Users,
  Calendar,
  CalendarClock,
  ChevronRight,
  Clock,
  FileText,
  PauseCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn, encodeSlugPath } from "@/lib/utils";
import { STATUS_TEXT, STATUS_BG, STATUS_BORDER, type StatusColor } from "@/lib/status-colors";
import { caseFrontmatter } from "@/lib/legal-types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { csrfFetch } from "@/lib/csrf";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRealtime } from "@/lib/realtime";
import { useLang } from "@/lib/use-lang";
import { useMe } from "@/lib/queries/auth";
import type { DashboardKey } from "@/content/dashboard";

interface LegalCaseItem {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  legalArea: string;
  priority: string;
  opponentName?: string;
  clientName?: string;
  courtName?: string;
  openDeadlines: number;
  criticalDeadlines: number;
  openTasks: number;
  documentCount: number;
  timeMinutes: number;
  conflictStatus?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  version?: number;
}

const STATUS_CONFIG: Record<
  string,
  { labelKey: DashboardKey; icon: React.ElementType; color: StatusColor }
> = {
  open: { labelKey: "cases.status_open", icon: Clock, color: "blue" },
  pending: { labelKey: "cases.status_pending", icon: PauseCircle, color: "amber" },
  settled: { labelKey: "cases.status_settled", icon: CheckCircle2, color: "emerald" },
  won: { labelKey: "cases.status_won", icon: CheckCircle2, color: "emerald" },
  lost: { labelKey: "cases.status_lost", icon: XCircle, color: "red" },
  appealed: { labelKey: "cases.status_appealed", icon: AlertTriangle, color: "orange" },
  dormant: { labelKey: "cases.status_dormant", icon: PauseCircle, color: "gray" },
  archived: { labelKey: "cases.status_archived", icon: Archive, color: "gray" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  medium: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  high: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function parseCase(page: BrainPage): LegalCaseItem {
  const fm = caseFrontmatter(page);
  const deadlines = fm.deadlines ?? [];
  const openDeadlines = deadlines.filter((d) => String(d.status ?? "pending") !== "done");
  const criticalDeadlines = openDeadlines.filter((d) => {
    const date = d.due_date || d.date;
    if (!date) return false;
    return daysUntil(date) <= 3;
  });
  const openTasks = (fm.tasks ?? []).filter((task) => !task.done).length;
  const timeMinutes = (fm.time_entries ?? []).reduce((sum, entry) => sum + (entry.minutes || 0), 0);
  return {
    slug: page.slug,
    title: page.title,
    caseNumber: fm.case_number || page.slug,
    status: fm.status || "open",
    legalArea: fm.legal_area || "",
    priority: fm.priority || "medium",
    opponentName: fm.opponent_name || undefined,
    clientName: fm.client_name || undefined,
    courtName: fm.court_name || undefined,
    openDeadlines: openDeadlines.length,
    criticalDeadlines: criticalDeadlines.length,
    openTasks,
    documentCount: (fm.documents ?? []).length,
    timeMinutes,
    conflictStatus:
      typeof fm.conflict_status === "string" ? (fm.conflict_status as string) : undefined,
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    tags: fm.tags || [],
    version: (fm.version as number) || 0,
  };
}

export default function CasesPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const meQuery = useMe();
  const userRole = meQuery.data?.user?.role ?? "lawyer";
  const canArchive = userRole === "admin" || userRole === "lawyer";
  const [cases, setCases] = useState<LegalCaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadCases = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.brain.listPages({ type: "legal_case", limit: 200 });
      const items = pages
        .map(parseCase)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      await setCache(OFFLINE_KEYS.cases, items);
      setCases(items);
    } catch (err) {
      const cached = await getCache<LegalCaseItem[]>(OFFLINE_KEYS.cases);
      if (cached) {
        setCases(cached);
        setLoadError(t("cases.error_offline"));
      } else {
        setLoadError(err instanceof Error ? err.message : t("cases.error_load"));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadCases();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCases]);

  // SSE: auto-refresh when another user archives, restores, or updates a case
  useRealtime("case.deleted", () => {
    void loadCases();
  });
  useRealtime("case.restored", () => {
    void loadCases();
  });
  useRealtime("case.updated", () => {
    void loadCases();
  });

  async function deleteCase(slug: string) {
    const caseItem = cases.find((c) => c.slug === slug);
    const confirmed = await confirm({
      title: t("cases.confirm_archive_title"),
      message: t("cases.confirm_archive_msg").replace("{{name}}", caseItem?.title ?? slug),
      confirmLabel: t("cases.btn_archive"),
      cancelLabel: t("cases.btn_cancel"),
      variant: "danger",
    });
    if (!confirmed) return;

    const next = cases.filter((c) => c.slug !== slug);
    setCases(next);
    await setCache(OFFLINE_KEYS.cases, next);

    try {
      if (isOnline()) {
        await api.brain.deletePage(slug);
      } else {
        await enqueueMutation({ type: "deletePage", payload: { slug } });
      }
      addToast({
        type: "success",
        title: t("cases.toast_deleted"),
        description: caseItem?.title ?? t("cases.toast_deleted_desc"),
        duration: 6000,
      });
    } catch (err) {
      setCases(cases);
      await setCache(OFFLINE_KEYS.cases, cases);
      addToast({
        type: "error",
        title: t("cases.toast_delete_fail"),
        description: err instanceof Error ? err.message : t("cases.unknown_error"),
      });
    }
  }

  async function bulkDelete(selectedRows: LegalCaseItem[]) {
    const slugs = selectedRows.map((c) => c.slug);
    const confirmed = await confirm({
      title: t("cases.confirm_bulk_archive_title"),
      message: t("cases.confirm_bulk_archive_msg").replace("{{count}}", String(slugs.length)),
      confirmLabel: t("cases.btn_archive"),
      cancelLabel: t("cases.btn_cancel"),
      variant: "danger",
    });
    if (!confirmed) return;

    setBulkLoading(true);
    const next = cases.filter((c) => !slugs.includes(c.slug));
    const backup = cases;
    setCases(next);
    await setCache(OFFLINE_KEYS.cases, next);

    try {
      let succeeded = 0;
      let failed = 0;
      for (const slug of slugs) {
        try {
          if (isOnline()) {
            await api.brain.deletePage(slug);
          } else {
            await enqueueMutation({ type: "deletePage", payload: { slug } });
          }
          succeeded++;
        } catch {
          failed++;
        }
      }
      if (failed === 0) {
        addToast({
          type: "success",
          title: `${succeeded} ${t("cases.toast_bulk_deleted")}`,
          duration: 6000,
        });
      } else {
        setCases(backup);
        await setCache(OFFLINE_KEYS.cases, backup);
        void loadCases();
        addToast({
          type: "error",
          title: t("cases.toast_partial_archive"),
          description: t("cases.toast_partial_desc")
            .replace("{{succeeded}}", String(succeeded))
            .replace("{{failed}}", String(failed)),
        });
      }
    } catch (err) {
      setCases(backup);
      await setCache(OFFLINE_KEYS.cases, backup);
      addToast({
        type: "error",
        title: t("cases.toast_bulk_fail"),
        description: err instanceof Error ? err.message : t("cases.unknown_error"),
      });
    } finally {
      setBulkLoading(false);
    }
  }

  async function restoreCase(slug: string) {
    const caseItem = cases.find((c) => c.slug === slug);
    const confirmed = await confirm({
      title: t("cases.confirm_restore_title"),
      message: t("cases.confirm_restore_msg").replace("{{name}}", caseItem?.title ?? slug),
      confirmLabel: t("cases.btn_restore"),
      cancelLabel: t("cases.btn_cancel"),
      variant: "primary",
    });
    if (!confirmed) return;

    try {
      const slugPath = slug.split("/").map(encodeURIComponent).join("/");
      const res = await csrfFetch(`/api/pages/${slugPath}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(caseItem?.version ?? 0),
        },
        body: JSON.stringify({
          frontmatter: {
            status: "open",
            restored_at: new Date().toISOString(),
            archived_at: null,
            archived_by: null,
          },
          merge: true,
        }),
      });
      if (res.ok) {
        const next = cases.map((c) => (c.slug === slug ? { ...c, status: "open" } : c));
        setCases(next);
        await setCache(OFFLINE_KEYS.cases, next);
        addToast({
          type: "success",
          title: t("cases.toast_restored"),
          description: caseItem?.title,
        });
      } else if (res.status === 403) {
        addToast({
          type: "error",
          title: t("cases.toast_access_denied"),
          description: t("cases.toast_access_denied_desc"),
        });
      } else if (res.status === 409) {
        addToast({
          type: "error",
          title: t("cases.toast_conflict"),
          description: t("cases.toast_conflict_desc"),
        });
        void loadCases();
      } else {
        addToast({
          type: "error",
          title: t("cases.toast_restore_fail"),
          description: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      addToast({
        type: "error",
        title: t("cases.toast_restore_fail"),
        description: err instanceof Error ? err.message : t("cases.unknown_error"),
      });
    }
  }

  async function bulkRestore(selectedRows: LegalCaseItem[]) {
    const slugs = selectedRows.map((c) => c.slug);
    const confirmed = await confirm({
      title: t("cases.confirm_bulk_restore_title"),
      message: t("cases.confirm_bulk_restore_msg").replace("{{count}}", String(slugs.length)),
      confirmLabel: t("cases.btn_restore"),
      cancelLabel: t("cases.btn_cancel"),
      variant: "primary",
    });
    if (!confirmed) return;

    setBulkLoading(true);
    const backup = cases;
    try {
      const next = cases.map((c) => (slugs.includes(c.slug) ? { ...c, status: "open" } : c));
      setCases(next);
      await setCache(OFFLINE_KEYS.cases, next);
      let succeeded = 0;
      let failed = 0;
      for (const row of selectedRows) {
        const slugPath = row.slug.split("/").map(encodeURIComponent).join("/");
        const res = await csrfFetch(`/api/pages/${slugPath}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "If-Match": String(row.version ?? 0),
          },
          body: JSON.stringify({
            frontmatter: {
              status: "open",
              restored_at: new Date().toISOString(),
              archived_at: null,
              archived_by: null,
            },
            merge: true,
          }),
        });
        if (res.ok) {
          succeeded++;
        } else {
          failed++;
        }
      }
      if (failed === 0) {
        addToast({
          type: "success",
          title: t("cases.toast_bulk_restored"),
          description: t("cases.toast_bulk_restored_desc").replace("{{count}}", String(succeeded)),
        });
      } else {
        setCases(backup);
        await setCache(OFFLINE_KEYS.cases, backup);
        void loadCases();
        addToast({
          type: "error",
          title: t("cases.toast_partial_restore"),
          description: t("cases.toast_partial_desc")
            .replace("{{succeeded}}", String(succeeded))
            .replace("{{failed}}", String(failed)),
        });
      }
    } catch (err) {
      setCases(backup);
      await setCache(OFFLINE_KEYS.cases, backup);
      addToast({
        type: "error",
        title: t("cases.toast_restore_fail"),
        description: err instanceof Error ? err.message : t("cases.unknown_error"),
      });
    } finally {
      setBulkLoading(false);
    }
  }

  const filtered = cases.filter((c) => {
    const matchesSearch =
      search === "" ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.caseNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.legalArea.toLowerCase().includes(search.toLowerCase()) ||
      (c.clientName || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.opponentName || "").toLowerCase().includes(search.toLowerCase());
    // B1: Archived cases are hidden by default, shown only when explicitly filtered
    const matchesStatus =
      statusFilter === "all" ? c.status !== "archived" : c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = cases.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const activeCases = cases.filter(
    (c) => !["archived", "won", "lost", "settled"].includes(c.status)
  );
  const criticalCases = activeCases.filter(
    (c) => c.criticalDeadlines > 0 || c.priority === "critical"
  );
  const casesMissingParties = activeCases.filter((c) => !c.clientName || !c.opponentName);
  const reviewNeededCases = activeCases.filter(
    (c) => c.conflictStatus === "conflict_pending" || c.openDeadlines > 0 || c.openTasks > 0
  );

  const columns: Column<LegalCaseItem>[] = [
    {
      key: "title",
      header: t("cases.col_title"),
      sortable: true,
      sortAccessor: (c) => c.title,
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
              STATUS_BG[(STATUS_CONFIG[c.status] || STATUS_CONFIG.open).color],
              STATUS_BORDER[(STATUS_CONFIG[c.status] || STATUS_CONFIG.open).color]
            )}
          >
            {(() => {
              const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.open;
              const Icon = cfg.icon;
              return <Icon size={16} className={STATUS_TEXT[cfg.color]} aria-hidden="true" />;
            })()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-[color:var(--ds-text)]">{c.title}</div>
            <div className="font-mono text-xs text-[color:var(--ds-text-subtle)]">
              {c.caseNumber}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: t("cases.col_status"),
      sortable: true,
      sortAccessor: (c) => c.status,
      cell: (c) => {
        const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.open;
        return (
          <Badge
            variant="default"
            className={cn(
              "border text-xs font-medium",
              STATUS_BG[cfg.color],
              STATUS_TEXT[cfg.color],
              STATUS_BORDER[cfg.color]
            )}
          >
            {t(cfg.labelKey)}
          </Badge>
        );
      },
    },
    {
      key: "priority",
      header: t("cases.col_priority"),
      sortable: true,
      sortAccessor: (c) => c.priority,
      hideOnMobile: true,
      cell: (c) => (
        <Badge
          variant="default"
          className={cn("border text-xs", PRIORITY_COLORS[c.priority] || PRIORITY_COLORS.medium)}
        >
          {c.priority}
        </Badge>
      ),
    },
    {
      key: "legalArea",
      header: t("cases.col_legal_area"),
      sortable: true,
      sortAccessor: (c) => c.legalArea,
      hideOnMobile: true,
      cell: (c) =>
        c.legalArea ? (
          <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
            <Scale size={10} />
            {c.legalArea}
          </span>
        ) : (
          <span className="text-[color:var(--ds-text-subtle)]">—</span>
        ),
    },
    {
      key: "client",
      header: t("cases.col_client"),
      hideOnMobile: true,
      cell: (c) =>
        c.clientName ? (
          <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
            <Users size={10} />
            {c.clientName}
          </span>
        ) : (
          <Badge variant="warning" className="text-xs">
            {t("cases.missing_client")}
          </Badge>
        ),
    },
    {
      key: "opponent",
      header: t("cases.col_opponent"),
      hideOnMobile: true,
      cell: (c) =>
        c.opponentName ? (
          <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
            <Users size={10} />
            {c.opponentName}
          </span>
        ) : (
          <span className="text-[color:var(--ds-text-subtle)]">—</span>
        ),
    },
    {
      key: "signals",
      header: t("cases.col_signals"),
      hideOnMobile: true,
      cell: (c) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={
              c.criticalDeadlines > 0 ? "danger" : c.openDeadlines > 0 ? "warning" : "default"
            }
            className="gap-1 text-xs"
          >
            <CalendarClock size={10} />
            {c.openDeadlines}
          </Badge>
          <Badge variant={c.openTasks > 0 ? "warning" : "default"} className="gap-1 text-xs">
            <CheckCircle2 size={10} />
            {c.openTasks}
          </Badge>
          <Badge variant="default" className="gap-1 text-xs">
            <FileText size={10} />
            {c.documentCount}
          </Badge>
        </div>
      ),
    },
    {
      key: "updatedAt",
      header: t("cases.col_updated"),
      sortable: true,
      sortAccessor: (c) => new Date(c.updatedAt).getTime(),
      cell: (c) => (
        <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
          <Calendar size={10} />
          {new Date(c.updatedAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "w-10",
      cell: (c) => (
        <div className="flex items-center gap-1">
          {canArchive && c.status === "archived" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                restoreCase(c.slug);
              }}
              className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-emerald-500/10 hover:text-emerald-600"
              title={t("cases.btn_restore")}
              aria-label={`${t("cases.btn_restore")} ${c.title}`}
            >
              <RotateCcw size={14} />
            </button>
          ) : canArchive ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteCase(c.slug);
              }}
              className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600"
              title={t("cases.delete")}
              aria-label={`${t("cases.delete")} ${c.title}`}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <ChevronRight size={14} className="text-[color:var(--ds-text-subtle)]" />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("cases.title")}
        description={`${cases.length} ${t("cases.count")}`}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("cases.title") }]}
        actions={
          <Link href="/dashboard/cases/new">
            <Button variant="glow" className="gap-2">
              <Plus size={16} />
              {t("cases.new")}
            </Button>
          </Link>
        }
      />

      <div className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("cases.health_active"), value: activeCases.length },
          { label: t("cases.health_critical"), value: criticalCases.length },
          { label: t("cases.health_review"), value: reviewNeededCases.length },
          { label: t("cases.health_missing_parties"), value: casesMissingParties.length },
        ].map((item) => (
          <div key={item.label} className="bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">{item.label}</div>
            <div className="mt-1 text-2xl leading-none font-semibold text-[color:var(--ds-text)] tabular-nums">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label={t("cases.all")}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const count = statusCounts[key] || 0;
          return (
            <FilterChip
              key={key}
              label={`${t(cfg.labelKey)} (${count})`}
              active={statusFilter === key}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            />
          );
        })}
      </div>

      {/* Search */}
      <SearchBar
        placeholder={t("cases.search")}
        onSearch={setSearch}
        onClear={() => setSearch("")}
        className="max-w-md"
      />

      {/* Error with retry */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadCases()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} />
            {t("cases.retry")}
          </Button>
        </div>
      )}

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle={t("cases.empty_title")}
        emptyDescription={
          cases.length === 0 ? t("cases.empty_no_cases") : t("cases.empty_filtered")
        }
        emptyIcon={Briefcase}
        emptyActionLabel={cases.length === 0 ? t("cases.empty_create") : undefined}
        onEmptyAction={cases.length === 0 ? () => router.push("/dashboard/cases/new") : undefined}
        onRowClick={(c) => router.push(`/dashboard/cases/${encodeSlugPath(c.slug)}`)}
        rowKey={(c) => c.slug}
        pageSize={20}
        selectable={canArchive}
        onBulkAction={
          canArchive ? (statusFilter === "archived" ? bulkRestore : bulkDelete) : undefined
        }
        bulkActionLabel={
          canArchive
            ? statusFilter === "archived"
              ? t("cases.bulk_restore_label")
              : t("cases.bulk_delete")
            : undefined
        }
        bulkActionIcon={statusFilter === "archived" ? RotateCcw : Trash2}
        bulkActionLoading={bulkLoading}
      />
    </div>
  );
}
