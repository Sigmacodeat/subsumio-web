"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  CheckSquare,
  Loader2,
  AlertTriangle,
  User,
  Clock,
  FileText,
  Filter,
  Inbox,
  Play,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import type { BrainPage } from "@/lib/types";
import { cn, encodeSlugPath, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import type { DashboardKey } from "@/content/dashboard";
import { csrfFetch } from "@/lib/csrf";

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-[color:var(--ds-warning-bg)] border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]",
  in_review:
    "bg-[color:var(--ds-info-bg)] border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]",
  approved:
    "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
  rejected:
    "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
  changes_requested:
    "bg-[color:var(--ds-attention-bg)] border-[color:var(--ds-attention-border)] text-[color:var(--ds-attention-text)]",
  awaiting_review:
    "bg-[color:var(--ds-category-purple-bg)] border-[color:var(--ds-category-purple-border)] text-[color:var(--ds-category-purple-text)]",
  needs_human_review:
    "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
};

function useStatusLabels(t: ReturnType<typeof useLang>["t"]): Record<string, string> {
  return {
    pending: t("review_queue.status_pending"),
    in_review: t("review_queue.status_in_review"),
    approved: t("review_queue.status_approved"),
    rejected: t("review_queue.status_rejected"),
    changes_requested: t("review_queue.status_changes_requested"),
    awaiting_review: t("review_queue.status_awaiting_review"),
    needs_human_review: t("review_queue.status_needs_human_review"),
  };
}

const TYPE_LABEL: Record<string, string> = {
  document_draft: "Schriftsatzentwurf",
  contract: "Vertrag",
  legal_case: "Akte",
  letter: "Schreiben",
  memo: "Aktenvermerk",
  pipeline_state: "Automatische Aktenanalyse",
};

function itemHref(page: BrainPage): string {
  return page.type === "legal_case"
    ? `/dashboard/cases/${encodeSlugPath(page.slug)}`
    : `/dashboard/brain/${encodeURIComponent(page.slug)}`;
}

/** Per type; the queue is filtered afterwards to pages that are up for review. */
const REVIEW_TYPE_MAX = 5_000;

const REVIEWABLE_TYPES = [
  "document_draft",
  "contract",
  "legal_case",
  "letter",
  "memo",
  "pipeline_state",
];

export default function ReviewQueuePage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const STATUS_LABELS = useStatusLabels(t);
  const [pages, setPages] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [updating, setUpdating] = useState<string | null>(null);
  // Who is reviewing — written as reviewed_by so the decision is attributable
  // in the document's frontmatter, not only in the audit log.
  const [meEmail, setMeEmail] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Every page of each type (paged), not the newest 100 per type.
      const perType = await Promise.all(
        REVIEWABLE_TYPES.map((type) => api.brain.listAllPages({ type, max: REVIEW_TYPE_MAX }))
      );
      setPages(perType.flat());
    } catch {
      setError("Die Freigaben konnten nicht geladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPages();
    let cancelled = false;
    api.auth
      .me()
      .then((me) => {
        if (cancelled) return;
        const email =
          (me as { user?: { email?: string } } | null)?.user?.email ??
          (me as { email?: string } | null)?.email ??
          null;
        setMeEmail(email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadPages]);

  const reviewItems = useMemo(() => {
    return pages
      .map((p) => {
        const fm = p.frontmatter ?? {};
        // Pipeline state pages use 'status' (awaiting_review / needs_human_review)
        // while document pages use 'review_status'
        const isPipeline = p.type === "pipeline_state";
        // A page without review_status was never put up for review — it is
        // not "pending" (that listed every matter of the firm as open work).
        const status = isPipeline
          ? typeof fm.status === "string"
            ? fm.status
            : ""
          : typeof fm.review_status === "string"
            ? fm.review_status
            : "";
        const assignee = typeof fm.review_assignee === "string" ? fm.review_assignee : undefined;
        const reviewedAt = typeof fm.reviewed_at === "string" ? fm.reviewed_at : undefined;
        return { page: p, status, assignee, reviewedAt, isPipeline };
      })
      .filter((item) => {
        if (!item.status) return false;
        // Only show pipeline_state pages that are awaiting_review or needs_human_review
        if (
          item.isPipeline &&
          item.status !== "awaiting_review" &&
          item.status !== "needs_human_review"
        )
          return false;
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (assigneeFilter !== "all" && item.assignee !== assigneeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const order = {
          pending: 0,
          in_review: 1,
          awaiting_review: 1,
          changes_requested: 2,
          needs_human_review: 2,
          rejected: 3,
          approved: 4,
        };
        return (
          (order[a.status as keyof typeof order] ?? 5) -
          (order[b.status as keyof typeof order] ?? 5)
        );
      });
  }, [pages, statusFilter, assigneeFilter]);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    pages.forEach((p) => {
      const a = p.frontmatter?.review_assignee;
      if (typeof a === "string" && a) set.add(a);
    });
    return Array.from(set).sort();
  }, [pages]);

  const reviewSummary = useMemo(() => {
    const counts = {
      total: reviewItems.length,
      pending: 0,
      inReview: 0,
      changesRequested: 0,
      done: 0,
    };

    reviewItems.forEach((item) => {
      if (item.status === "pending") counts.pending += 1;
      if (item.status === "in_review") counts.inReview += 1;
      if (item.status === "changes_requested") counts.changesRequested += 1;
      if (item.status === "approved" || item.status === "rejected") counts.done += 1;
    });

    return counts;
  }, [reviewItems]);

  async function updateStatus(slug: string, status: string) {
    setUpdating(slug);
    try {
      await api.brain.updatePage({
        slug,
        frontmatter: {
          review_status: status,
          reviewed_at: new Date().toISOString(),
          ...(meEmail ? { reviewed_by: meEmail } : {}),
        },
      });
      await loadPages();
      addToast({ type: "success", title: t("review_queue.toast_status_updated" as DashboardKey) });
    } catch {
      setError("Der Status konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.");
    } finally {
      setUpdating(null);
    }
  }

  async function assignTo(slug: string, assignee: string) {
    setUpdating(slug);
    try {
      await api.brain.updatePage({
        slug,
        frontmatter: {
          review_assignee: assignee,
          review_status: "in_review",
        },
      });
      await loadPages();
      addToast({ type: "success", title: t("review_queue.toast_assigned" as DashboardKey) });
    } catch {
      setError("Die Zuweisung ist fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setUpdating(null);
    }
  }

  async function resumePipeline(caseSlug: string) {
    setUpdating(`pipeline-${caseSlug}`);
    try {
      const res = await csrfFetch("/api/pipeline/resume", {
        method: "POST",
        // Long-running: csrfFetch would otherwise abort after 30s.
        signal: AbortSignal.timeout(300_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_slug: caseSlug, resume_from_layer: 3 }),
      });
      if (!res.ok) throw new Error("resume_failed");
      await loadPages();
      addToast({
        type: "success",
        title: t("review_queue.toast_pipeline_resumed" as DashboardKey),
      });
    } catch {
      setError("Die Aktenanalyse konnte nicht fortgesetzt werden. Bitte versuchen Sie es erneut.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("review_queue.title")}
        description={t("review_queue.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("review_queue.breadcrumb") },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 shadow-sm">
            <div className="flex min-w-0 items-center gap-2">
              <Filter size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
              <select
                aria-label={t("review_queue.filter_status" as DashboardKey)}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 text-sm text-[color:var(--ds-text)]"
              >
                <option value="all">{t("review_queue.all_status")}</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            {assignees.length > 0 && (
              <select
                aria-label={t("review_queue.filter_assignee" as DashboardKey)}
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="h-10 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 text-sm text-[color:var(--ds-text)]"
              >
                <option value="all">{t("review_queue.all_assignees")}</option>
                {assignees.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
            <Badge
              variant="default"
              className="ml-auto border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2.5 py-1 text-xs text-[color:var(--ds-text-muted)]"
            >
              {reviewItems.length} {t("review_queue.docs_count")}
            </Badge>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {loading && (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-2xl" />
              ))}
            </div>
          )}

          {/* Review items */}
          {!loading && reviewItems.length > 0 && (
            <div className="space-y-3">
              {reviewItems.map(({ page, status, assignee, reviewedAt, isPipeline }) => (
                <div
                  key={page.slug}
                  className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-sm transition-[border-color,box-shadow] duration-[var(--ds-duration-normal)] hover:border-[color:var(--ds-border-strong)] hover:shadow-md motion-reduce:transition-none"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <a
                          href={itemHref(page)}
                          className="block truncate text-sm font-medium text-[color:var(--ds-text)] hover:underline"
                        >
                          {page.title}
                        </a>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ds-text-muted)]">
                          <span>{(page.type && TYPE_LABEL[page.type]) || "Dokument"}</span>
                          {assignee && (
                            <span className="flex items-center gap-1">
                              <User size={10} /> {assignee}
                            </span>
                          )}
                          {reviewedAt && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} /> geprüft {formatDate(reviewedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 md:justify-end">
                      <Badge
                        variant="default"
                        className={cn(
                          "border px-2.5 py-1 text-xs",
                          STATUS_STYLES[status] ?? STATUS_STYLES.pending
                        )}
                      >
                        {STATUS_LABELS[status] ?? status}
                      </Badge>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex flex-col gap-3 border-t border-[color:var(--ds-border)] pt-4 md:flex-row md:items-center">
                    <input
                      type="text"
                      placeholder={t("review_queue.assign_placeholder")}
                      aria-label={`Prüfung zuweisen: ${page.title}`}
                      defaultValue={assignee ?? ""}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== assignee)
                          void assignTo(page.slug, e.target.value.trim());
                      }}
                      className="h-10 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 text-xs text-[color:var(--ds-text)] md:w-56"
                    />
                    <div className="flex flex-wrap gap-1 md:ml-auto md:justify-end">
                      {updating === page.slug ||
                      updating === `pipeline-${page.frontmatter?.case_ref}` ? (
                        <Loader2
                          size={14}
                          className="animate-spin text-[color:var(--ds-text-muted)]"
                        />
                      ) : isPipeline ? (
                        <>
                          {status === "awaiting_review" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const caseRef =
                                  typeof page.frontmatter?.case_ref === "string"
                                    ? page.frontmatter.case_ref
                                    : "";
                                if (caseRef) void resumePipeline(caseRef);
                              }}
                              className="gap-1 text-xs whitespace-nowrap"
                            >
                              <Play size={12} aria-hidden="true" /> Freigeben &amp; fortsetzen
                            </Button>
                          )}
                          {status === "needs_human_review" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const caseRef =
                                  typeof page.frontmatter?.case_ref === "string"
                                    ? page.frontmatter.case_ref
                                    : "";
                                if (caseRef) void resumePipeline(caseRef);
                              }}
                              className="gap-1 text-xs whitespace-nowrap"
                            >
                              <AlertCircle size={12} aria-hidden="true" /> Prüfen &amp; fortsetzen
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatus(page.slug, "approved")}
                            className="gap-1 text-xs whitespace-nowrap"
                          >
                            <CheckSquare size={12} /> {t("review_queue.approve")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(page.slug, "changes_requested")}
                            className="text-xs whitespace-nowrap"
                          >
                            {t("review_queue.revise")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(page.slug, "rejected")}
                            className="text-xs whitespace-nowrap text-[color:var(--ds-text-muted)]"
                          >
                            {t("review_queue.reject")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && reviewItems.length === 0 && !error && (
            <EmptyState
              icon={Inbox}
              title="Keine offenen Freigaben"
              description="Entwürfe, Verträge und Akten, die eine Prüfung benötigen, erscheinen hier."
              actionLabel={
                statusFilter !== "all" || assigneeFilter !== "all"
                  ? "Filter zurücksetzen"
                  : undefined
              }
              onAction={
                statusFilter !== "all" || assigneeFilter !== "all"
                  ? () => {
                      setStatusFilter("all");
                      setAssigneeFilter("all");
                    }
                  : undefined
              }
            />
          )}
        </div>

        <aside className="hidden space-y-3 xl:block">
          <div className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
              <CheckSquare size={16} className="text-[color:var(--ds-text-muted)]" />
              Freigabe-Status
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { label: "Gesamt", value: reviewSummary.total },
                { label: STATUS_LABELS.pending, value: reviewSummary.pending },
                { label: STATUS_LABELS.in_review, value: reviewSummary.inReview },
                { label: STATUS_LABELS.changes_requested, value: reviewSummary.changesRequested },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                >
                  <div className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                    {item.value}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-xs leading-relaxed text-[color:var(--ds-text-muted)] shadow-sm">
            <div className="mb-2 text-sm font-medium text-[color:var(--ds-text)]">
              {t("review_queue.rhythm_title")}
            </div>
            {t("review_queue.rhythm_desc")}
          </div>
        </aside>
      </div>
    </div>
  );
}
