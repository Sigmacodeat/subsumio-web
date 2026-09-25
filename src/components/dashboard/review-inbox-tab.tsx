"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Lightbulb,
  Loader2,
  MessageCircle,
  Send,
  UserPlus,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { issuePortalLink } from "@/lib/portal-link-client";
import { decideDeadlineSuggestion } from "@/lib/legal/deadline-decision-client";
import { useRealtime } from "@/lib/realtime";
import { cn, encodeSlugPath, formatRelativeTime } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import { GroundedOutputPanel } from "@/components/legal/GroundedOutputPanel";
import { readApiError } from "@/lib/api-response";

type ReviewType =
  | "all"
  | "suggested_deadline"
  | "document_request"
  | "client_submission"
  | "suggested_party"
  | "pending_fact";

interface ReviewItem {
  id: string;
  type:
    | "document_request"
    | "suggested_deadline"
    | "client_submission"
    | "suggested_party"
    | "pending_fact";
  title: string;
  description: string;
  caseSlug: string | null;
  caseTitle: string | null;
  priority: "high" | "medium" | "low";
  source: string;
  createdAt: string;
  status: string;
  actionLabel: string;
  secondaryLabel: string | null;
  pageSlug: string;
  requestSlug: string | null;
  items: string[];
  channel: string | null;
  portalLink: boolean;
  messageDraft: string | null;
  dueDate: string | null;
  urgency: string | null;
  law: string | null;
  confidence: string | null;
  sourceQuote: string | null;
  partyName: string | null;
  partyRole: string | null;
  factId: string | null;
  factStatement: string | null;
  factConfidence: string | null;
  arrayIndex: number | null;
}

const TYPE_ICON: Record<ReviewItem["type"], React.ElementType> = {
  suggested_deadline: AlertTriangle,
  document_request: FileText,
  client_submission: MessageCircle,
  suggested_party: UserPlus,
  pending_fact: Lightbulb,
};

const TYPE_LABEL: Record<ReviewItem["type"], { de: string; en: string }> = {
  suggested_deadline: { de: "Fristvorschlag", en: "Deadline" },
  document_request: { de: "Dokumentenanfrage", en: "Doc Request" },
  client_submission: { de: "Mandanteneingang", en: "Submission" },
  suggested_party: { de: "Parteienvorschlag", en: "Suggested Party" },
  pending_fact: { de: "Offene Tatsache", en: "Pending Fact" },
};

const TYPE_BADGE: Record<ReviewItem["type"], string> = {
  suggested_deadline:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  document_request:
    "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  client_submission:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  suggested_party:
    "border-[color:var(--ds-category-violet-border)] bg-[color:var(--ds-category-violet-bg)] text-[color:var(--ds-category-violet-text)]",
  pending_fact:
    "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
};

const ACTION_BTN =
  "inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-xs whitespace-nowrap text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none";

const URGENCY_LABEL: Record<string, { de: string; en: string }> = {
  critical: { de: "Kritisch", en: "Critical" },
  high: { de: "Hoch", en: "High" },
  medium: { de: "Mittel", en: "Medium" },
  low: { de: "Niedrig", en: "Low" },
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-l-2 border-l-[color:var(--ds-danger-solid)]",
  medium: "border-l-2 border-l-[color:var(--ds-warning-solid)]",
  low: "border-l-2 border-l-[color:var(--ds-border)]",
};

function timeLabel(lang: Lang, value: string): string {
  if (lang === "en") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB");
  }
  return formatRelativeTime(value);
}

const I18N: Record<string, { de: string; en: string }> = {
  all: { de: "Alle", en: "All" },
  deadlines: { de: "Fristen", en: "Deadlines" },
  doc_requests: { de: "Dokumente", en: "Documents" },
  submissions: { de: "Eingänge", en: "Submissions" },
  parties: { de: "Parteien", en: "Parties" },
  facts: { de: "Tatsachen", en: "Facts" },
  empty_title: { de: "Nichts zu prüfen", en: "Nothing to review" },
  empty: {
    de: "Alle Fristvorschläge, Mandanteneingänge und Tatsachen sind bearbeitet.",
    en: "All suggested deadlines, client submissions and facts are processed.",
  },
  empty_filtered: {
    de: "In dieser Kategorie ist nichts offen.",
    en: "Nothing open in this category.",
  },
  show_all: { de: "Alle anzeigen", en: "Show all" },
  error: {
    de: "Die offenen Einträge konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
    en: "Failed to load review items.",
  },
  to_case: { de: "Zur Akte", en: "To case" },
  approve: { de: "Übernehmen", en: "Approve" },
  reject: { de: "Verwerfen", en: "Reject" },
  send: { de: "Senden", en: "Send" },
  fulfilled: { de: "Erledigt", en: "Fulfilled" },
  mark_reviewed: { de: "Geprüft", en: "Reviewed" },
  send_whatsapp: { de: "Per WhatsApp", en: "Via WhatsApp" },
  send_email: { de: "Per E-Mail", en: "Via Email" },
  copy_portal: { de: "Portal-Link", en: "Portal Link" },
  toast_approved: { de: "Frist übernommen", en: "Deadline approved" },
  toast_rejected: { de: "Frist verworfen", en: "Deadline rejected" },
  toast_sent: { de: "Dokumentenanfrage versendet", en: "Document request sent" },
  toast_fulfilled: { de: "Als erledigt markiert", en: "Marked as fulfilled" },
  toast_reviewed: { de: "Als geprüft markiert", en: "Marked as reviewed" },
  toast_party_confirmed: { de: "Partei bestätigt", en: "Party confirmed" },
  toast_party_rejected: { de: "Partei verworfen", en: "Party rejected" },
  toast_fact_approved: { de: "Tatsache bestätigt", en: "Fact approved" },
  toast_fact_party: { de: "Als Parteibehauptung markiert", en: "Marked as party assertion" },
  toast_imported: { de: "Dokument importiert", en: "Document imported" },
  toast_portal_copied: { de: "Portal-Link kopiert", en: "Portal link copied" },
  toast_error: { de: "Aktion fehlgeschlagen", en: "Action failed" },
  ai_suggestion: { de: "KI-Vorschlag", en: "AI suggestion" },
  due_date: { de: "Frist:", en: "Due:" },
  days_overdue: { de: "Tage überfällig", en: "days overdue" },
  days: { de: "Tage", en: "days" },
};

function tr(key: string, lang: Lang): string {
  const entry = I18N[key];
  return entry ? (lang === "en" ? entry.en : entry.de) : key;
}

/**
 * A write from the review inbox: CSRF header, and a refused request is an
 * error (with the server's message) — never reported as success.
 */
async function sendReviewWrite(url: string, method: "POST" | "PATCH", body: unknown) {
  const res = await csrfFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" && json.error ? json.error : `HTTP ${res.status}`
    );
  }
  return json;
}

export function ReviewInboxTab() {
  const { lang } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ReviewType>("all");
  const [editedDates, setEditedDates] = useState<Record<string, string>>({});

  const reviewQuery = useQuery({
    queryKey: ["review-inbox"],
    queryFn: () => api.reviewInbox.list(),
    staleTime: 30_000,
  });

  // Realtime: invalidate on relevant events
  useRealtime(
    "document_request.created",
    () => void qc.invalidateQueries({ queryKey: ["review-inbox"] })
  );
  useRealtime(
    "document_request.updated",
    () => void qc.invalidateQueries({ queryKey: ["review-inbox"] })
  );
  useRealtime("deadline.changed", () => void qc.invalidateQueries({ queryKey: ["review-inbox"] }));
  useRealtime("intake.received", () => void qc.invalidateQueries({ queryKey: ["review-inbox"] }));

  const actionMutation = useMutation({
    mutationFn: async (params: {
      type: ReviewItem["type"];
      action:
        | "approve"
        | "reject"
        | "send"
        | "fulfilled"
        | "reviewed"
        | "party_assertion"
        | "import_document";
      item: ReviewItem;
      /** Lawyer-edited deadline date (suggested_deadline approve only). */
      dueDate?: string;
    }) => {
      const { type, action, item } = params;
      if (type === "suggested_deadline") {
        if (item.arrayIndex !== null && item.caseSlug) {
          // Server-side, atomic: the deadline is written and checked BEFORE
          // the suggestion is marked approved (src/lib/legal/deadline-decision.ts).
          await decideDeadlineSuggestion({
            caseSlug: item.caseSlug,
            index: item.arrayIndex,
            action: action === "approve" ? "approve" : "reject",
            dueDate:
              action === "approve" ? (params.dueDate ?? item.dueDate ?? undefined) : undefined,
          });
          return { ok: true };
        }
        return api.brain.updatePage({
          slug: item.pageSlug,
          frontmatter:
            action === "approve"
              ? { review_status: "approved", reviewed_at: new Date().toISOString() }
              : { review_status: "rejected", reviewed_at: new Date().toISOString() },
        });
      }
      if (type === "document_request") {
        return sendReviewWrite("/api/document-requests", "PATCH", {
          slug: item.requestSlug,
          status: action === "send" ? "sent" : "fulfilled",
          sent_at: action === "send" ? new Date().toISOString() : undefined,
        });
      }
      if (type === "client_submission") {
        if (action === "import_document") {
          return sendReviewWrite("/api/legal/submission-to-document", "POST", {
            submissionSlug: item.pageSlug,
          });
        }
        return sendReviewWrite("/api/legal/submission-review", "POST", {
          submissionSlug: item.pageSlug,
          action: "reviewed",
        });
      }
      if (type === "suggested_party" && item.arrayIndex !== null) {
        const reviewStatus = action === "approve" ? "approved" : "rejected";
        return sendReviewWrite(`/api/pages/${encodeSlugPath(item.pageSlug)}`, "PATCH", {
          frontmatter: {
            suggested_parties: {
              [item.arrayIndex]: { confirmed: true, review_status: reviewStatus },
            },
          },
          merge: true,
        });
      }
      if (type === "pending_fact" && item.factId && item.factStatement) {
        return sendReviewWrite("/api/legal/matter-knowledge", "POST", {
          caseSlug: item.caseSlug || item.pageSlug,
          action,
          factId: item.factId,
          statement: item.factStatement,
          source: {
            type: "upload_analysis",
            label: item.source || "Review Inbox",
          },
        });
      }
      if (type === "pending_fact" && item.arrayIndex !== null) {
        // Fallback for facts without factId — direct patch
        const reviewStatus = action === "approve" ? "approved" : "party_assertion";
        return sendReviewWrite(`/api/pages/${encodeSlugPath(item.pageSlug)}`, "PATCH", {
          frontmatter: {
            facts: {
              [item.arrayIndex]: {
                review_status: reviewStatus,
                reviewed_at: new Date().toISOString(),
              },
            },
          },
          merge: true,
        });
      }
      throw new Error("unknown_type");
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["review-inbox"] });
      qc.invalidateQueries({ queryKey: ["sidebar-badges"] });
      const toastMap: Record<string, string> = {
        approve: "toast_approved",
        reject: "toast_rejected",
        send: "toast_sent",
        fulfilled: "toast_fulfilled",
        reviewed: "toast_reviewed",
        party_assertion: "toast_fact_party",
        import_document: "toast_imported",
      };
      // Type-specific toast overrides
      if (variables.type === "suggested_party") {
        addToast({
          type: "success",
          title: tr(
            variables.action === "approve" ? "toast_party_confirmed" : "toast_party_rejected",
            lang
          ),
        });
        return;
      }
      if (variables.type === "pending_fact") {
        addToast({
          type: "success",
          title: tr(
            variables.action === "approve" ? "toast_fact_approved" : "toast_fact_party",
            lang
          ),
        });
        return;
      }
      addToast({
        type: "success",
        title: tr(toastMap[variables.action] || "toast_approved", lang),
      });
    },
    onError: (err) => {
      addToast({
        type: "error",
        title: err instanceof Error && err.message ? err.message : tr("toast_error", lang),
      });
    },
  });

  const allItems = useMemo(() => reviewQuery.data?.items ?? [], [reviewQuery.data?.items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allItems.length };
    for (const item of allItems) {
      c[item.type] = (c[item.type] || 0) + 1;
    }
    return c;
  }, [allItems]);

  const filtered = useMemo(() => {
    if (filter === "all") return allItems;
    return allItems.filter((item) => item.type === filter);
  }, [allItems, filter]);

  const loading = reviewQuery.isLoading;
  const error = reviewQuery.isError;

  const tabs: Array<{ key: ReviewType; label: string }> = [
    { key: "all", label: tr("all", lang) },
    { key: "suggested_deadline", label: tr("deadlines", lang) },
    { key: "document_request", label: tr("doc_requests", lang) },
    { key: "client_submission", label: tr("submissions", lang) },
    { key: "suggested_party", label: tr("parties", lang) },
    { key: "pending_fact", label: tr("facts", lang) },
  ];

  // Portal links are not stored: a fresh one is issued for each copy.
  async function copyPortalUrl(item: ReviewItem) {
    if (!item.portalLink || !item.caseSlug) return;
    try {
      const url = await issuePortalLink(item.caseSlug);
      await navigator.clipboard.writeText(url);
      addToast({ type: "success", title: tr("toast_portal_copied", lang) });
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Portal-Link konnte nicht erzeugt werden",
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Type filter tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--ds-border)]">
        {tabs.map((tab) => {
          const isActive = filter === tab.key;
          const count = counts[tab.key] || 0;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(isActive ? "all" : tab.key)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
                isActive
                  ? "border-[color:var(--brand-primary)] font-medium text-[color:var(--ds-text)]"
                  : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs font-medium",
                    isActive
                      ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                      : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertTriangle size={32} className="text-[color:var(--ds-text-muted)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">{tr("error", lang)}</p>
          <Button variant="ghost" size="sm" onClick={() => void reviewQuery.refetch()}>
            <RefreshCw size={14} className="mr-2" aria-hidden="true" />
            {lang === "en" ? "Retry" : "Erneut laden"}
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading &&
        !error &&
        filtered.length === 0 &&
        (filter !== "all" ? (
          <EmptyState
            icon={ClipboardCheck}
            title={tr("empty_title", lang)}
            description={tr("empty_filtered", lang)}
            actionLabel={tr("show_all", lang)}
            onAction={() => setFilter("all")}
          />
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title={tr("empty_title", lang)}
            description={tr("empty", lang)}
          />
        ))}

      {/* Review items list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {/* One grounding pass over every AI suggestion in view (not one call per row). */}
          <GroundedOutputPanel
            text={filtered
              .filter((item) => item.confidence)
              .map((item) => [item.title, item.law, item.description].filter(Boolean).join(" — "))
              .join("\n\n")}
          />
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.type];
            const typeLabel = TYPE_LABEL[item.type];
            // Spinner only on the row being processed; all rows stay disabled meanwhile.
            const busy = actionMutation.isPending && actionMutation.variables?.item.id === item.id;
            const locked = actionMutation.isPending;
            return (
              <div
                key={item.id}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,background-color,box-shadow] duration-[var(--ds-duration-normal)] hover:border-[color:var(--brand-primary)]/30 hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none",
                  PRIORITY_STYLES[item.priority]
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
                  <Icon size={16} className="text-[color:var(--ds-text-muted)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        TYPE_BADGE[item.type]
                      )}
                    >
                      {lang === "en" ? typeLabel.en : typeLabel.de}
                    </span>
                    {item.urgency && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                          item.urgency === "high" || item.urgency === "critical"
                            ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                            : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                        )}
                      >
                        {URGENCY_LABEL[item.urgency]?.[lang === "en" ? "en" : "de"] ?? item.urgency}
                      </span>
                    )}
                    {item.confidence && (
                      <span className="flex shrink-0 items-center gap-0.5 text-xs text-[color:var(--brand-primary)]">
                        <Zap size={10} />
                        {tr("ai_suggestion", lang)}
                      </span>
                    )}
                    {item.law && (
                      <span className="shrink-0 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {item.law}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {item.title}
                    </span>
                  </div>
                  {item.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                    <span>{item.source}</span>
                    {item.createdAt && <span>{timeLabel(lang, item.createdAt)}</span>}
                    {item.caseSlug && (
                      <Link
                        href={`/dashboard/cases/${item.caseSlug}`}
                        className="inline-flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                      >
                        {item.caseTitle || tr("to_case", lang)}
                        <ArrowUpRight size={11} />
                      </Link>
                    )}
                  </div>
                  {/* Inline actions */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {item.type === "document_request" && item.status === "draft" && (
                      <>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "send",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Send size={12} />
                          )}
                          {tr("send", lang)}
                        </button>
                        {item.portalLink && item.caseSlug && (
                          <button onClick={() => void copyPortalUrl(item)} className={ACTION_BTN}>
                            <ArrowUpRight size={12} />
                            {tr("copy_portal", lang)}
                          </button>
                        )}
                      </>
                    )}
                    {item.type === "document_request" && item.status === "sent" && (
                      <button
                        onClick={() =>
                          actionMutation.mutate({
                            type: item.type,
                            action: "fulfilled",
                            item,
                          })
                        }
                        disabled={locked}
                        className={ACTION_BTN}
                      >
                        {busy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        {tr("fulfilled", lang)}
                      </button>
                    )}
                    {item.type === "suggested_deadline" && (
                      <>
                        <label className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                          {tr("due_date", lang)}
                          <input
                            type="date"
                            aria-label={tr("due_date", lang)}
                            value={editedDates[item.id] ?? item.dueDate ?? ""}
                            onChange={(e) =>
                              setEditedDates((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text)]"
                          />
                        </label>
                        <button
                          onClick={() =>
                            void actionMutation
                              .mutateAsync({
                                type: item.type,
                                action: "approve",
                                item,
                                dueDate: editedDates[item.id] ?? item.dueDate ?? undefined,
                              })
                              .catch(() => {
                                /* surfaced via onError toast */
                              })
                          }
                          disabled={locked || !(editedDates[item.id] ?? item.dueDate)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-2 py-1 text-xs text-[color:var(--ds-success-text)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-success-bg)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] disabled:opacity-50 motion-reduce:transition-none"
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          {tr("approve", lang)}
                        </button>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "reject",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                          {tr("reject", lang)}
                        </button>
                      </>
                    )}
                    {item.type === "client_submission" && (
                      <>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "reviewed",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          {tr("mark_reviewed", lang)}
                        </button>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "import_document",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <FileText size={12} />
                          )}
                          {lang === "en" ? "Import as document" : "Als Dokument übernehmen"}
                        </button>
                      </>
                    )}
                    {item.type === "suggested_party" && (
                      <>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "approve",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          {tr("approve", lang)}
                        </button>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "reject",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                          {tr("reject", lang)}
                        </button>
                      </>
                    )}
                    {item.type === "pending_fact" && (
                      <>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "approve",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          {tr("approve", lang)}
                        </button>
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              type: item.type,
                              action: "party_assertion",
                              item,
                            })
                          }
                          disabled={locked}
                          className={ACTION_BTN}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <MessageCircle size={12} />
                          )}
                          {lang === "en" ? "Party Assertion" : "Parteibehauptung"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
