"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ChevronRight,
  Clock,
  PauseCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";
import { STATUS_TEXT, STATUS_BG, STATUS_BORDER, type StatusColor } from "@/lib/status-colors";
import { caseFrontmatter } from "@/lib/legal-types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { csrfFetch } from "@/lib/csrf";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { SearchBar } from "@/components/dashboard/search-bar";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRealtime } from "@/lib/realtime";
import { useLang } from "@/lib/use-lang";
import { useMe } from "@/lib/queries/auth";
import type { DashboardKey } from "@/content/dashboard";
import { CaseQuickCreateDialog } from "@/components/legal/CaseQuickCreateDialog";
import { CaseCloseChecklistDialog } from "@/components/legal/case-close-checklist-dialog";

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
  /** Earliest open deadline (overdue ones included) — what a register shows first. */
  nextDeadline?: { date: string; title: string; days: number };
  lawyerName?: string;
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

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Kritisch",
  urgent: "Dringend",
  high: "Hoch",
  medium: "Mittel",
  normal: "Normal",
  low: "Niedrig",
};
/** Priorities worth flagging in the register; "Mittel"/"Normal"/"Niedrig" stay silent. */
const PRIORITY_FLAGGED = new Set(["high", "urgent", "critical"]);
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)] border-[color:var(--ds-neutral-border)]",
  medium:
    "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)] border-[color:var(--ds-info-border)]",
  high: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] border-[color:var(--ds-warning-border)]",
  urgent:
    "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]",
  critical:
    "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]",
};

type OpenDeadline = { due_date: string; title?: string };

/**
 * `external` are the case's open deadlines from the Fristen read-model: most
 * deadlines live as standalone pages, not inside the case frontmatter, so the
 * register would otherwise show "—" for matters that do have a deadline.
 */
function parseCase(page: BrainPage, external: OpenDeadline[] = []): LegalCaseItem {
  const fm = caseFrontmatter(page);
  const deadlines = fm.deadlines ?? [];
  const embeddedOpen = deadlines.filter((d) => String(d.status ?? "pending") !== "done");
  const seen = new Set(embeddedOpen.map((d) => `${d.due_date}|${d.title ?? ""}`));
  const openDeadlines: OpenDeadline[] = [
    ...embeddedOpen,
    ...external.filter((d) => !seen.has(`${d.due_date}|${d.title ?? ""}`)),
  ];
  const datedOpen = openDeadlines
    .map((d) => ({ date: d.due_date, title: d.title ?? "", days: daysUntil(d.due_date) }))
    .filter((d): d is { date: string; title: string; days: number } => d.days !== null)
    .sort((a, b) => a.days - b.days);
  const criticalDeadlines = datedOpen.filter((d) => d.days <= 3);
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
    nextDeadline: datedOpen[0],
    lawyerName: fm.own_lawyer_name || undefined,
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [closeChecklistOpen, setCloseChecklistOpen] = useState(false);
  const [closeChecklistSlug, setCloseChecklistSlug] = useState("");
  const [closeChecklistTitle, setCloseChecklistTitle] = useState("");

  const loadCases = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pages, fristenRes] = await Promise.all([
        api.brain.listAllPages({ type: "legal_case" }),
        // Optional: without the read-model the register still works, just
        // with embedded deadlines only.
        api.legal.fristen().catch(() => ({ fristen: [] })),
      ]);
      const byCase = new Map<string, OpenDeadline[]>();
      for (const f of fristenRes.fristen) {
        if (!f.case_slug || !f.due_date || f.status === "done") continue;
        const list = byCase.get(f.case_slug) ?? [];
        list.push({ due_date: f.due_date, title: f.title });
        byCase.set(f.case_slug, list);
      }
      const items = pages
        .map((p) => parseCase(p, byCase.get(p.slug)))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      await setCache(OFFLINE_KEYS.cases, items);
      setCases(items);
    } catch {
      const cached = await getCache<Array<LegalCaseItem | BrainPage>>(OFFLINE_KEYS.cases);
      if (cached) {
        // "Neue Akte" offline appends a raw page to this cache — normalise it
        // so search/sort never hit undefined fields.
        setCases(
          cached.map(
            (c) => ("frontmatter" in c && !("caseNumber" in c) ? parseCase(c) : c) as LegalCaseItem
          )
        );
        setLoadError(t("cases.error_offline"));
      } else {
        setLoadError(t("cases.error_load"));
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
    setCloseChecklistSlug(slug);
    setCloseChecklistTitle(caseItem?.title ?? slug);
    setCloseChecklistOpen(true);
  }

  async function confirmDeleteCase(slug: string) {
    const caseItem = cases.find((c) => c.slug === slug);

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
    } catch {
      setCases(cases);
      await setCache(OFFLINE_KEYS.cases, cases);
      addToast({
        type: "error",
        title: t("cases.toast_delete_fail"),
        description: t("cases.unknown_error"),
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
    } catch {
      setCases(backup);
      await setCache(OFFLINE_KEYS.cases, backup);
      addToast({
        type: "error",
        title: t("cases.toast_bulk_fail"),
        description: t("cases.unknown_error"),
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
      // /api/trash restores the matter AND reactivates the documents the
      // archive cascade tombstoned (tombstone_reason === "case_archived").
      const res = await csrfFetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
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
          description: t("cases.unknown_error"),
        });
      }
    } catch {
      addToast({
        type: "error",
        title: t("cases.toast_restore_fail"),
        description: t("cases.unknown_error"),
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
        const res = await csrfFetch("/api/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: row.slug }),
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
    } catch {
      setCases(backup);
      await setCache(OFFLINE_KEYS.cases, backup);
      addToast({
        type: "error",
        title: t("cases.toast_restore_fail"),
        description: t("cases.unknown_error"),
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
  const visibleStatuses = Object.keys(STATUS_CONFIG).filter(
    (key) => (statusCounts[key] || 0) > 0 || statusFilter === key
  );
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const activeCases = cases.filter(
    (c) => !["archived", "won", "lost", "settled"].includes(c.status)
  );
  const dueSoonCases = activeCases.filter(
    (c) => c.nextDeadline && c.nextDeadline.days >= 0 && c.nextDeadline.days <= 7
  );
  const overdueCases = activeCases.filter((c) => c.nextDeadline && c.nextDeadline.days < 0);
  const unassignedCases = activeCases.filter((c) => !c.lawyerName);

  // Register columns: which ones show depends on the width the table actually
  // gets (container query), not the viewport — with the assistant panel open a
  // 1440 px screen leaves ~800 px for the list.
  const columns: Column<LegalCaseItem>[] = [
    {
      key: "caseNumber",
      header: L("Aktenzeichen", "Case no."),
      sortable: true,
      sortAccessor: (c) => c.caseNumber,
      hideOnMobile: true,
      width: "w-[8.5rem] whitespace-nowrap",
      cell: (c) => (
        <span className="font-mono text-xs text-[color:var(--ds-text-muted)] tabular-nums">
          {c.caseNumber}
        </span>
      ),
    },
    {
      key: "title",
      header: t("cases.col_title"),
      sortable: true,
      sortAccessor: (c) => c.title,
      cell: (c) => {
        const cfg = STATUS_CONFIG[c.status];
        // Status and priority only when they deviate from the default ("Offen",
        // "Mittel"/"Normal") — identical badges on every row are noise.
        const showStatus = c.status !== "open" && cfg;
        const showPriority = PRIORITY_FLAGGED.has(c.priority);
        return (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-[color:var(--ds-text)]">{c.title}</div>
              <div className="font-mono text-xs text-[color:var(--ds-text-subtle)] tabular-nums md:hidden">
                {c.caseNumber}
              </div>
            </div>
            {showStatus && (
              <Badge
                variant="default"
                className={cn(
                  "shrink-0 border text-xs font-medium",
                  STATUS_BG[cfg.color],
                  STATUS_TEXT[cfg.color],
                  STATUS_BORDER[cfg.color]
                )}
              >
                {t(cfg.labelKey)}
              </Badge>
            )}
            {showPriority && (
              <Badge
                variant="default"
                className={cn("shrink-0 border text-xs", PRIORITY_COLORS[c.priority])}
              >
                {PRIORITY_LABELS[c.priority] ?? c.priority}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "client",
      header: t("cases.col_client"),
      sortable: true,
      sortAccessor: (c) => c.clientName ?? "",
      width: "hidden @2xl:table-cell max-w-[11rem]",
      cell: (c) =>
        c.clientName ? (
          <span className="block truncate text-[color:var(--ds-text)]">{c.clientName}</span>
        ) : (
          <span className="text-xs text-[color:var(--ds-warning-text)]">
            {t("cases.missing_client")}
          </span>
        ),
    },
    {
      key: "opponent",
      header: t("cases.col_opponent"),
      hideOnMobile: true,
      width: "hidden @4xl:table-cell max-w-[11rem]",
      cell: (c) =>
        c.opponentName ? (
          <span className="block truncate text-[color:var(--ds-text-muted)]">{c.opponentName}</span>
        ) : (
          <span className="text-[color:var(--ds-text-subtle)]">—</span>
        ),
    },
    {
      key: "nextDeadline",
      header: L("Nächste Frist", "Next deadline"),
      sortable: true,
      sortAccessor: (c) => c.nextDeadline?.days ?? Number.MAX_SAFE_INTEGER,
      width: "whitespace-nowrap",
      cell: (c) => {
        const d = c.nextDeadline;
        if (!d) return <span className="text-[color:var(--ds-text-subtle)]">—</span>;
        const tone =
          d.days < 0 || d.days <= 3
            ? "text-[color:var(--ds-danger-text)]"
            : d.days <= 7
              ? "text-[color:var(--ds-warning-text)]"
              : "text-[color:var(--ds-text-muted)]";
        return (
          <span className="tabular-nums" title={d.title || undefined}>
            <span className="text-[color:var(--ds-text)]">{formatDate(d.date)}</span>
            <span className={cn("ml-1.5 text-xs", tone)}>{formatDaysUntil(d.days)}</span>
          </span>
        );
      },
    },
    {
      key: "lawyer",
      header: L("Sachbearbeiter", "Responsible"),
      sortable: true,
      sortAccessor: (c) => c.lawyerName ?? "",
      hideOnMobile: true,
      width: "hidden @5xl:table-cell max-w-[10rem]",
      cell: (c) =>
        c.lawyerName ? (
          <span className="block truncate text-[color:var(--ds-text-muted)]">{c.lawyerName}</span>
        ) : (
          <span className="text-[color:var(--ds-text-subtle)]">—</span>
        ),
    },
    {
      key: "legalArea",
      header: t("cases.col_legal_area"),
      sortable: true,
      sortAccessor: (c) => c.legalArea,
      hideOnMobile: true,
      width: "hidden @6xl:table-cell whitespace-nowrap",
      cell: (c) =>
        c.legalArea ? (
          <span className="text-[color:var(--ds-text-muted)]">{c.legalArea}</span>
        ) : (
          <span className="text-[color:var(--ds-text-subtle)]">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "w-16",
      hideOnMobile: true,
      cell: (c) => (
        <div className="flex items-center justify-end gap-1">
          {canArchive && c.status === "archived" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                restoreCase(c.slug);
              }}
              className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] opacity-0 transition-[background-color,color,opacity] duration-[var(--ds-duration-fast)] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[color:var(--ds-success-bg)] hover:text-[color:var(--ds-success-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
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
              className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] opacity-0 transition-[background-color,color,opacity] duration-[var(--ds-duration-fast)] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              title={t("cases.delete")}
              aria-label={`${t("cases.delete")} ${c.title}`}
            >
              <Archive size={14} />
            </button>
          ) : null}
          <ChevronRight
            size={14}
            className="text-[color:var(--ds-text-subtle)]"
            aria-hidden="true"
          />
        </div>
      ),
    },
  ];

  const kpis = [
    { label: t("cases.health_active"), value: activeCases.length, tone: "" },
    {
      label: L("Frist in 7 Tagen", "Deadline within 7 days"),
      value: dueSoonCases.length,
      tone: "text-[color:var(--ds-warning-text)]",
    },
    {
      label: L("Frist überfällig", "Deadline overdue"),
      value: overdueCases.length,
      tone: "text-[color:var(--ds-danger-text)]",
    },
    { label: L("Ohne Sachbearbeiter", "Unassigned"), value: unassignedCases.length, tone: "" },
  ];

  return (
    <div data-tour="cases-list" className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("cases.title")}
        description={L(
          "Aktenregister der Kanzlei — nach Aktenzeichen, Mandant und nächster Frist.",
          "The firm's case register — by case number, client and next deadline."
        )}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("cases.title") },
        ]}
        actions={
          <PrimaryAction onClick={() => setQuickCreateOpen(true)}>{t("cases.new")}</PrimaryAction>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] lg:grid-cols-4">
        {kpis.map((item) => (
          <div key={item.label} className="bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">{item.label}</div>
            <div
              className={cn(
                "mt-1 text-2xl leading-none font-semibold tabular-nums",
                item.value > 0 && item.tone ? item.tone : "text-[color:var(--ds-text)]"
              )}
            >
              {loading && cases.length === 0 ? <Skeleton className="h-6 w-8" /> : item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Search + status filter: only statuses that actually occur (or the active one) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar
            placeholder={t("cases.search")}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            className="w-full max-w-md"
          />
          <Link
            href="/dashboard/altlasten"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          >
            <Archive size={13} aria-hidden="true" />
            {L("Bestandsakten prüfen", "Review legacy cases")}
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </div>
        {visibleStatuses.length > 1 || statusFilter !== "all" ? (
          <div className="filter-strip">
            <FilterChip
              label={t("cases.all")}
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            {visibleStatuses.map((key) => {
              const cfg = STATUS_CONFIG[key];
              const count = statusCounts[key] || 0;
              return (
                <FilterChip
                  key={key}
                  label={count > 0 ? `${t(cfg.labelKey)} (${count})` : t(cfg.labelKey)}
                  active={statusFilter === key}
                  onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Error with retry */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadCases()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} />
            {t("cases.retry")}
          </Button>
        </div>
      )}

      {/* Data table — @container lets columns react to the real list width */}
      {loadError && cases.length === 0 ? null : (
        <div className="@container">
          <DataTable
            density="dense"
            columns={columns}
            data={filtered}
            loading={loading}
            emptyTitle={t("cases.empty_title")}
            emptyDescription={
              cases.length === 0 ? t("cases.empty_no_cases") : t("cases.empty_filtered")
            }
            emptyIcon={Briefcase}
            emptyActionLabel={cases.length === 0 ? t("cases.empty_create") : undefined}
            onEmptyAction={cases.length === 0 ? () => setQuickCreateOpen(true) : undefined}
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
            bulkActionIcon={statusFilter === "archived" ? RotateCcw : Archive}
            bulkActionLoading={bulkLoading}
          />
        </div>
      )}

      <CaseQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={() => {
          void loadCases();
          setQuickCreateOpen(false);
        }}
      />

      <CaseCloseChecklistDialog
        open={closeChecklistOpen}
        onOpenChange={setCloseChecklistOpen}
        caseSlug={closeChecklistSlug}
        caseTitle={closeChecklistTitle}
        onConfirmArchive={() => void confirmDeleteCase(closeChecklistSlug)}
      />
    </div>
  );
}
