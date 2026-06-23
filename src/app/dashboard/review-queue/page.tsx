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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  in_review: "bg-blue-500/10 border-blue-500/20 text-blue-600",
  approved: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  rejected: "bg-red-500/10 border-red-500/20 text-red-600",
  changes_requested: "bg-orange-500/10 border-orange-500/20 text-orange-600",
};

function useStatusLabels(t: ReturnType<typeof useLang>["t"]): Record<string, string> {
  return {
    pending: t("review_queue.status_pending"),
    in_review: t("review_queue.status_in_review"),
    approved: t("review_queue.status_approved"),
    rejected: t("review_queue.status_rejected"),
    changes_requested: t("review_queue.status_changes_requested"),
  };
}

const REVIEWABLE_TYPES = ["document_draft", "contract", "legal_case", "letter", "memo"];

export default function ReviewQueuePage() {
  const { t, lang } = useLang();
  const STATUS_LABELS = useStatusLabels(t);
  const [pages, setPages] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [updating, setUpdating] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: BrainPage[] = [];
      for (const type of REVIEWABLE_TYPES) {
        try {
          const result = await api.brain.listPages({ type, limit: 100 });
          all.push(...result);
        } catch {
          /* skip type if it fails */
        }
      }
      setPages(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review-Queue konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const reviewItems = useMemo(() => {
    return pages
      .map((p) => {
        const fm = p.frontmatter ?? {};
        const status = typeof fm.review_status === "string" ? fm.review_status : "pending";
        const assignee = typeof fm.review_assignee === "string" ? fm.review_assignee : undefined;
        const reviewedAt = typeof fm.reviewed_at === "string" ? fm.reviewed_at : undefined;
        return { page: p, status, assignee, reviewedAt };
      })
      .filter((item) => {
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (assigneeFilter !== "all" && item.assignee !== assigneeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const order = { pending: 0, in_review: 1, changes_requested: 2, rejected: 3, approved: 4 };
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
        },
      });
      await loadPages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status konnte nicht aktualisiert werden.");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zuweisung fehlgeschlagen.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
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
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {loading && (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
              <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
            </div>
          )}

          {/* Review items */}
          {!loading && reviewItems.length > 0 && (
            <div className="space-y-3">
              {reviewItems.map(({ page, status, assignee, reviewedAt }) => (
                <div
                  key={page.slug}
                  className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-[color:var(--ds-border-strong)] hover:shadow-md"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <a
                          href={`/dashboard/vault/${page.slug}`}
                          className="block truncate text-sm font-medium text-[color:var(--ds-text)] hover:underline"
                        >
                          {page.title}
                        </a>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ds-text-muted)]">
                          <span className="max-w-full truncate font-mono">{page.slug}</span>
                          <span>{page.type}</span>
                          {assignee && (
                            <span className="flex items-center gap-1">
                              <User size={10} /> {assignee}
                            </span>
                          )}
                          {reviewedAt && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} />{" "}
                              {new Date(reviewedAt).toLocaleDateString(
                                lang === "en" ? "en-GB" : "de-DE"
                              )}
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
                      defaultValue={assignee ?? ""}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== assignee)
                          void assignTo(page.slug, e.target.value.trim());
                      }}
                      className="h-10 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 text-xs text-[color:var(--ds-text)] md:w-56"
                    />
                    <div className="flex flex-wrap gap-1 md:ml-auto md:justify-end">
                      {updating === page.slug ? (
                        <Loader2
                          size={14}
                          className="animate-spin text-[color:var(--ds-text-muted)]"
                        />
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(page.slug, "approved")}
                            className="gap-1 text-xs text-emerald-600 hover:bg-emerald-500/10"
                          >
                            <CheckSquare size={12} /> {t("review_queue.approve")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(page.slug, "changes_requested")}
                            className="text-xs text-orange-600 hover:bg-orange-500/10"
                          >
                            {t("review_queue.revise")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(page.slug, "rejected")}
                            className="text-xs text-red-600 hover:bg-red-500/10"
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
            <div className="rounded-2xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center">
              <Inbox
                size={40}
                className="mx-auto mb-3 text-[color:var(--ds-text-muted)] opacity-40"
              />
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {t("review_queue.empty")}{" "}
                <code className="rounded bg-[color:var(--ds-hover)] px-1 text-xs">
                  review_status
                </code>{" "}
                {t("review_queue.empty_hint")}
              </p>
            </div>
          )}
        </div>

        <aside className="hidden space-y-3 xl:block">
          <div className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
              <CheckSquare size={16} className="text-[color:var(--ds-text-muted)]" />
              Review-Status
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t("review_queue.all_status"), value: reviewSummary.total },
                { label: STATUS_LABELS.pending, value: reviewSummary.pending },
                { label: STATUS_LABELS.in_review, value: reviewSummary.inReview },
                { label: STATUS_LABELS.changes_requested, value: reviewSummary.changesRequested },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                >
                  <div className="text-lg font-semibold text-[color:var(--ds-text)]">
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
              {lang === "en" ? "Review rhythm" : "Arbeitsrhythmus"}
            </div>
            {lang === "en"
              ? "Approve open documents first, then batch revision requests. Assigned matters automatically move into review."
              : "Offene Dokumente zuerst freigeben, dann Überarbeitungen bündeln. Zugewiesene Akten wechseln automatisch in Prüfung."}
          </div>
        </aside>
      </div>
    </div>
  );
}
