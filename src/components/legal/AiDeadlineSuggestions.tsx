"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  EyeOff,
  Loader2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { cn, encodeSlugPath } from "@/lib/utils";
import type { Lang } from "@/content/site";
import type { BrainPage } from "@/lib/types";

interface AiDeadlineSuggestion {
  slug: string;
  title: string;
  caseSlug: string | null;
  dueDate: string | null;
  urgency: string | null;
  law: string | null;
  confidence: string | null;
  source: string;
  sourceQuote: string | null;
  reviewStatus: string;
  createdAt: string;
  status: string;
}

const I18N: Record<string, { de: string; en: string }> = {
  title: { de: "KI-Fristvorschläge", en: "AI Deadline Suggestions" },
  description: {
    de: "Alle von der KI erkannten Fristen across alle Akten — mit Quelle, Berechnung und Risiko.",
    en: "All AI-detected deadlines across all matters — with source, calculation and risk.",
  },
  empty: { de: "Keine offenen KI-Fristvorschläge.", en: "No open AI deadline suggestions." },
  error: { de: "Vorschläge konnten nicht geladen werden.", en: "Failed to load suggestions." },
  batch_approve: { de: "Auswahl übernehmen", en: "Approve selected" },
  batch_reject: { de: "Auswahl verwerfen", en: "Reject selected" },
  select_all: { de: "Alle auswählen", en: "Select all" },
  deselect_all: { de: "Auswahl aufheben", en: "Deselect all" },
  approve: { de: "Übernehmen", en: "Approve" },
  reject: { de: "Verwerfen", en: "Reject" },
  to_case: { de: "Zur Akte", en: "To case" },
  toast_approved: { de: "Frist übernommen", en: "Deadline approved" },
  toast_rejected: { de: "Frist verworfen", en: "Deadline rejected" },
  toast_batch_approved: { de: "Fristen übernommen", en: "Deadlines approved" },
  toast_batch_rejected: { de: "Fristen verworfen", en: "Deadlines rejected" },
  toast_error: { de: "Aktion fehlgeschlagen", en: "Action failed" },
  days_overdue: { de: "Tage überfällig", en: "days overdue" },
  days: { de: "Tage", en: "days" },
  today: { de: "heute", en: "today" },
  tomorrow: { de: "morgen", en: "tomorrow" },
  in_days: { de: "in", en: "in" },
  source: { de: "Quelle", en: "Source" },
  risk: { de: "Risiko", en: "Risk" },
  law: { de: "Gesetz", en: "Law" },
  confidence: { de: "Konfidenz", en: "Confidence" },
  due: { de: "Fällig", en: "Due" },
  case: { de: "Akte", en: "Case" },
  ai_suggestion: { de: "KI-Vorschlag", en: "AI suggestion" },
  unreviewed: { de: "Ungeprüft", en: "Unreviewed" },
  needs_review: { de: "Prüfung nötig", en: "Needs review" },
};

function tr(key: string, lang: Lang): string {
  const entry = I18N[key];
  return entry ? (lang === "en" ? entry.en : entry.de) : key;
}

function fm(page: BrainPage): Record<string, unknown> {
  return (page.frontmatter ?? {}) as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function riskVariant(
  urgency: string | null,
  daysUntil: number | null
): "danger" | "warning" | "info" {
  if (urgency === "high" || urgency === "critical" || (daysUntil !== null && daysUntil < 0))
    return "danger";
  if (daysUntil !== null && daysUntil <= 7) return "warning";
  return "info";
}

const RISK_STYLES: Record<string, string> = {
  danger:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  warning:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  info: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
};

export function AiDeadlineSuggestions() {
  const { lang } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const suggestionsQuery = useQuery({
    queryKey: ["ai-deadline-suggestions"],
    queryFn: async () => {
      const pages = await api.brain.listPages({ type: "legal_deadline", limit: 300 });
      return pages
        .filter((page) => {
          const f = fm(page);
          const rs = str(f.review_status);
          const status = str(f.status);
          return (
            rs !== "approved" && rs !== "rejected" && status !== "done" && status !== "completed"
          );
        })
        .map<AiDeadlineSuggestion>((page) => {
          const f = fm(page);
          return {
            slug: page.slug,
            title: page.title || "Fristvorschlag",
            caseSlug: str(f.case_slug) || null,
            dueDate: str(f.due_date) || str(f.date) || null,
            urgency: str(f.urgency) || str(f.ai_confidence) || null,
            law: str(f.law) || null,
            confidence: str(f.confidence) || str(f.ai_confidence) || null,
            source: str(f.source) || "ai",
            sourceQuote: str(f.source_quote) || null,
            reviewStatus: str(f.review_status) || "unreviewed",
            createdAt: str(f.created_at) || str(page.created_at),
            status: str(f.status) || "pending",
          };
        })
        .sort((a, b) => {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return aDate - bDate;
        });
    },
    staleTime: 30_000,
  });

  const batchMutation = useMutation({
    mutationFn: async (params: { slugs: string[]; action: "approve" | "reject" }) => {
      const frontmatter =
        params.action === "approve"
          ? { review_status: "approved", reviewed_at: new Date().toISOString() }
          : { review_status: "rejected", reviewed_at: new Date().toISOString() };
      await Promise.all(params.slugs.map((slug) => api.brain.updatePage({ slug, frontmatter })));
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["ai-deadline-suggestions"] });
      qc.invalidateQueries({ queryKey: ["sidebar-badges"] });
      qc.invalidateQueries({ queryKey: ["review-inbox"] });
      setSelected(new Set());
      addToast({
        type: "success",
        title:
          variables.action === "approve"
            ? tr("toast_batch_approved", lang)
            : tr("toast_batch_rejected", lang),
      });
    },
    onError: () => {
      addToast({ type: "error", title: tr("toast_error", lang) });
    },
  });

  const singleMutation = useMutation({
    mutationFn: async (params: { slug: string; action: "approve" | "reject" }) => {
      const frontmatter =
        params.action === "approve"
          ? { review_status: "approved", reviewed_at: new Date().toISOString() }
          : { review_status: "rejected", reviewed_at: new Date().toISOString() };
      await api.brain.updatePage({ slug: params.slug, frontmatter });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["ai-deadline-suggestions"] });
      qc.invalidateQueries({ queryKey: ["sidebar-badges"] });
      qc.invalidateQueries({ queryKey: ["review-inbox"] });
      addToast({
        type: "success",
        title:
          variables.action === "approve" ? tr("toast_approved", lang) : tr("toast_rejected", lang),
      });
    },
    onError: () => {
      addToast({ type: "error", title: tr("toast_error", lang) });
    },
  });

  const suggestions = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);
  const loading = suggestionsQuery.isLoading;
  const error = suggestionsQuery.isError;

  const toggleSelection = useCallback((slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(suggestions.map((s) => s.slug)));
  }, [suggestions]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const hasSelection = selected.size > 0;
  const busy = batchMutation.isPending || singleMutation.isPending;

  const riskCounts = useMemo(() => {
    const counts = { danger: 0, warning: 0, info: 0 };
    for (const s of suggestions) {
      const days = s.dueDate ? getDaysUntil(s.dueDate) : null;
      counts[riskVariant(s.urgency, days)]++;
    }
    return counts;
  }, [suggestions]);

  return (
    <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[color:var(--brand-primary)]" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {tr("title", lang)}
            </h2>
          </div>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {tr("description", lang)}
          </p>
        </div>
        {/* Risk summary badges */}
        <div className="flex gap-1.5">
          {riskCounts.danger > 0 && (
            <Badge variant="default" className={cn("text-xs", RISK_STYLES.danger)}>
              {riskCounts.danger} {tr("risk", lang)}
            </Badge>
          )}
          {riskCounts.warning > 0 && (
            <Badge variant="default" className={cn("text-xs", RISK_STYLES.warning)}>
              {riskCounts.warning}
            </Badge>
          )}
          {riskCounts.info > 0 && (
            <Badge variant="default" className={cn("text-xs", RISK_STYLES.info)}>
              {riskCounts.info}
            </Badge>
          )}
        </div>
      </div>

      {/* Batch actions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--ds-border)] pb-3">
          <button
            onClick={hasSelection && selected.size === suggestions.length ? deselectAll : selectAll}
            className="text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
          >
            {hasSelection && selected.size === suggestions.length
              ? tr("deselect_all", lang)
              : tr("select_all", lang)}
          </button>
          {hasSelection && (
            <>
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                {selected.size} {lang === "en" ? "selected" : "ausgewählt"}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs text-[color:var(--ds-success-text)]"
                disabled={busy}
                onClick={() =>
                  void batchMutation.mutateAsync({
                    slugs: [...selected],
                    action: "approve",
                  })
                }
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {tr("batch_approve", lang)}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs text-[color:var(--ds-danger-text)]"
                disabled={busy}
                onClick={() =>
                  void batchMutation.mutateAsync({
                    slugs: [...selected],
                    action: "reject",
                  })
                }
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                {tr("batch_reject", lang)}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertTriangle size={15} />
          {tr("error", lang)}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <CheckCircle2 size={28} className="text-[color:var(--ds-success-text)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">{tr("empty", lang)}</p>
        </div>
      )}

      {/* Suggestion list */}
      {!loading && !error && suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const days = s.dueDate ? getDaysUntil(s.dueDate) : null;
            const risk = riskVariant(s.urgency, days);
            const isSelected = selected.has(s.slug);
            return (
              <div
                key={s.slug}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  isSelected
                    ? "border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/5"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] hover:bg-[color:var(--ds-hover)]"
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelection(s.slug)}
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "brand-bg border-[color:var(--brand-primary)] text-white"
                      : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]"
                  )}
                  aria-label={isSelected ? tr("deselect_all", lang) : tr("select_all", lang)}
                >
                  {isSelected && <Check size={11} />}
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {s.title}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        RISK_STYLES[risk]
                      )}
                    >
                      {s.urgency || risk}
                    </span>
                    {s.confidence && (
                      <span className="flex items-center gap-0.5 text-xs text-[color:var(--brand-primary)]">
                        <Zap size={10} />
                        {tr("ai_suggestion", lang)}
                      </span>
                    )}
                    {s.law && (
                      <span className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {s.law}
                      </span>
                    )}
                    {s.reviewStatus === "unreviewed" && (
                      <span className="flex items-center gap-0.5 rounded-full border border-slate-400/20 bg-slate-400/10 px-2 py-0.5 text-xs text-slate-600">
                        <EyeOff size={10} />
                        {tr("unreviewed", lang)}
                      </span>
                    )}
                    {s.reviewStatus === "needs_review" && (
                      <span className="flex items-center gap-0.5 rounded-full border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2 py-0.5 text-xs text-[color:var(--ds-danger-text)]">
                        <AlertTriangle size={10} />
                        {tr("needs_review", lang)}
                      </span>
                    )}
                  </div>

                  {/* Source quote */}
                  {s.sourceQuote && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[color:var(--ds-text-muted)] italic">
                      {`„${s.sourceQuote.slice(0, 150)}"`}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {s.dueDate ? (
                        <>
                          {new Date(s.dueDate).toLocaleDateString(
                            lang === "en" ? "en-GB" : "de-DE"
                          )}
                          {days !== null && (
                            <span
                              className={cn(
                                "ml-1 font-medium",
                                days < 0
                                  ? "text-[color:var(--ds-danger-text)]"
                                  : days <= 3
                                    ? "text-[color:var(--ds-warning-text)]"
                                    : ""
                              )}
                            >
                              {days < 0
                                ? `${Math.abs(days)} ${tr("days_overdue", lang)}`
                                : days === 0
                                  ? tr("today", lang)
                                  : days === 1
                                    ? tr("tomorrow", lang)
                                    : `${tr("in_days", lang)} ${days} ${tr("days", lang)}`}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span>
                      {tr("source", lang)}: {s.source}
                    </span>
                    {s.caseSlug && (
                      <Link
                        href={`/dashboard/cases/${encodeSlugPath(s.caseSlug)}`}
                        className="inline-flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                      >
                        {tr("to_case", lang)}
                        <ArrowUpRight size={11} />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Inline actions */}
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() =>
                      void singleMutation.mutateAsync({ slug: s.slug, action: "approve" })
                    }
                    disabled={busy}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] transition-colors hover:bg-[color:var(--ds-success-bg)] disabled:opacity-50"
                    title={tr("approve", lang)}
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  </button>
                  <button
                    onClick={() =>
                      void singleMutation.mutateAsync({ slug: s.slug, action: "reject" })
                    }
                    disabled={busy}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] transition-colors hover:bg-[color:var(--ds-danger-bg)] disabled:opacity-50"
                    title={tr("reject", lang)}
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
