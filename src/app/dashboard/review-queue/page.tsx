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

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  in_review: "bg-blue-500/10 border-blue-500/20 text-blue-600",
  approved: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  rejected: "bg-red-500/10 border-red-500/20 text-red-600",
  changes_requested: "bg-orange-500/10 border-orange-500/20 text-orange-600",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  in_review: "In Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  changes_requested: "Überarbeitung",
};

const REVIEWABLE_TYPES = ["document_draft", "contract", "legal_case", "letter", "memo"];

export default function ReviewQueuePage() {
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
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Prüfwarteschlange"
        description="Kollaborative Dokumentenprüfung mit Status, Zuständigkeiten und nachvollziehbarer Freigabe"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Prüfwarteschlange" }]}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[color:var(--ds-text-muted)]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)]"
          >
            <option value="all">Alle Status</option>
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
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)]"
          >
            <option value="all">Alle Bearbeiter</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <Badge
          variant="default"
          className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
        >
          {reviewItems.length} Dokumente
        </Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      )}

      {/* Review items */}
      {!loading && reviewItems.length > 0 && (
        <div className="space-y-2">
          {reviewItems.map(({ page, status, assignee, reviewedAt }) => (
            <div
              key={page.slug}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FileText
                    size={16}
                    className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
                  />
                  <div className="min-w-0">
                    <a
                      href={`/dashboard/vault/${page.slug}`}
                      className="block truncate text-sm font-medium text-[color:var(--ds-text)] hover:underline"
                    >
                      {page.title}
                    </a>
                    <div className="mt-1 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                      <span className="font-mono">{page.slug}</span>
                      <span>·</span>
                      <span>{page.type}</span>
                      {assignee && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <User size={10} /> {assignee}
                          </span>
                        </>
                      )}
                      {reviewedAt && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock size={10} /> {new Date(reviewedAt).toLocaleDateString("de-DE")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="default"
                    className={cn("border text-xs", STATUS_STYLES[status] ?? STATUS_STYLES.pending)}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--ds-border)] pt-3">
                <input
                  type="text"
                  placeholder="Bearbeiter zuweisen…"
                  defaultValue={assignee ?? ""}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== assignee)
                      void assignTo(page.slug, e.target.value.trim());
                  }}
                  className="w-40 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                />
                <div className="ml-auto flex gap-1">
                  {updating === page.slug ? (
                    <Loader2 size={14} className="animate-spin text-[color:var(--ds-text-muted)]" />
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatus(page.slug, "approved")}
                        className="gap-1 text-xs text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <CheckSquare size={12} /> Freigeben
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatus(page.slug, "changes_requested")}
                        className="text-xs text-orange-600 hover:bg-orange-500/10"
                      >
                        Überarbeiten
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatus(page.slug, "rejected")}
                        className="text-xs text-red-600 hover:bg-red-500/10"
                      >
                        Ablehnen
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
        <div className="py-16 text-center">
          <Inbox size={40} className="mx-auto mb-3 text-[color:var(--ds-text-muted)] opacity-40" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Keine Dokumente in der Review-Queue. Dokumente mit Frontmatter-Feld{" "}
            <code className="rounded bg-[color:var(--ds-hover)] px-1 text-xs">review_status</code>{" "}
            erscheinen hier.
          </p>
        </div>
      )}
    </div>
  );
}
