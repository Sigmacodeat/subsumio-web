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
  Mail,
  Send,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";

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
  portalUrl: string | null;
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
  suggested_deadline: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  document_request: "border-blue-500/20 bg-blue-500/10 text-blue-600",
  client_submission: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  suggested_party: "border-purple-500/20 bg-purple-500/10 text-purple-600",
  pending_fact: "border-cyan-500/20 bg-cyan-500/10 text-cyan-600",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-l-2 border-l-red-500",
  medium: "border-l-2 border-l-amber-500",
  low: "border-l-2 border-l-[color:var(--ds-border)]",
};

function timeLabel(lang: Lang, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return lang === "en" ? "just now" : "gerade eben";
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000);
    return lang === "en" ? `${mins}m ago` : `vor ${mins} Min`;
  }
  if (diff < 86_400_000) {
    const hrs = Math.floor(diff / 3_600_000);
    return lang === "en" ? `${hrs}h ago` : `vor ${hrs} Std`;
  }
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const I18N: Record<string, { de: string; en: string }> = {
  all: { de: "Alle", en: "All" },
  deadlines: { de: "Fristen", en: "Deadlines" },
  doc_requests: { de: "Dokumente", en: "Documents" },
  submissions: { de: "Eingänge", en: "Submissions" },
  parties: { de: "Parteien", en: "Parties" },
  facts: { de: "Fakten", en: "Facts" },
  empty: {
    de: "Keine offenen Review-Items. Alle Aktenpost ist bearbeitet.",
    en: "No open review items. All case mail is processed.",
  },
  error: { de: "Review-Items konnten nicht geladen werden.", en: "Failed to load review items." },
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
  days_overdue: { de: "Tage überfällig", en: "days overdue" },
  days: { de: "Tage", en: "days" },
};

function tr(key: string, lang: Lang): string {
  const entry = I18N[key];
  return entry ? (lang === "en" ? entry.en : entry.de) : key;
}

export function ReviewInboxTab() {
  const { lang } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ReviewType>("all");

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
    }) => {
      const { type, action, item } = params;
      if (type === "suggested_deadline") {
        if (item.arrayIndex !== null && item.caseSlug) {
          const reviewStatus = action === "approve" ? "approved" : "rejected";
          // Patch the case frontmatter to mark the suggested deadline as confirmed
          await fetch(`/api/pages/${encodeURIComponent(item.caseSlug)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frontmatter: {
                suggested_deadlines: {
                  [item.arrayIndex]: { confirmed: true, review_status: reviewStatus },
                },
              },
              merge: true,
            }),
          }).then((res) => res.json());
          // When approved, auto-create a legal_deadline page so it appears in calendar + deadlines list
          if (action === "approve" && item.dueDate) {
            try {
              await fetch("/api/pages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  slug: `legal/deadlines/${Date.now()}-${item.caseSlug.split("/").pop()}`,
                  title: item.title,
                  type: "legal_deadline",
                  frontmatter: {
                    case_slug: item.caseSlug,
                    due_date: item.dueDate,
                    title: item.title,
                    status: "pending",
                    urgency: item.urgency || "medium",
                    source: item.source || "ai",
                    source_quote: item.sourceQuote || null,
                    review_status: "approved",
                    auto_created: true,
                    created_at: new Date().toISOString(),
                  },
                }),
              });
            } catch {
              /* best effort — deadline page creation is non-blocking */
            }
          }
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
        return fetch("/api/document-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: item.requestSlug,
            status: action === "send" ? "sent" : "fulfilled",
            sent_at: action === "send" ? new Date().toISOString() : undefined,
          }),
        }).then((res) => res.json());
      }
      if (type === "client_submission") {
        if (action === "import_document") {
          return fetch("/api/legal/submission-to-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionSlug: item.pageSlug }),
          }).then((res) => res.json());
        }
        return fetch("/api/legal/submission-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionSlug: item.pageSlug,
            action: "reviewed",
          }),
        }).then((res) => res.json());
      }
      if (type === "suggested_party" && item.arrayIndex !== null) {
        const reviewStatus = action === "approve" ? "approved" : "rejected";
        return fetch(`/api/pages/${encodeURIComponent(item.pageSlug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frontmatter: {
              suggested_parties: {
                [item.arrayIndex]: { confirmed: true, review_status: reviewStatus },
              },
            },
            merge: true,
          }),
        }).then((res) => res.json());
      }
      if (type === "pending_fact" && item.factId && item.factStatement) {
        return fetch("/api/legal/matter-knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseSlug: item.caseSlug || item.pageSlug,
            action,
            factId: item.factId,
            statement: item.factStatement,
            source: {
              type: "upload_analysis",
              label: item.source || "Review Inbox",
            },
          }),
        }).then((res) => res.json());
      }
      if (type === "pending_fact" && item.arrayIndex !== null) {
        // Fallback for facts without factId — direct patch
        const reviewStatus = action === "approve" ? "approved" : "party_assertion";
        return fetch(`/api/pages/${encodeURIComponent(item.pageSlug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frontmatter: {
              facts: {
                [item.arrayIndex]: {
                  review_status: reviewStatus,
                  reviewed_at: new Date().toISOString(),
                },
              },
            },
            merge: true,
          }),
        }).then((res) => res.json());
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
    onError: () => {
      addToast({ type: "error", title: tr("toast_error", lang) });
    },
  });

  const allItems = reviewQuery.data?.items ?? [];

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

  function copyPortalUrl(item: ReviewItem) {
    if (!item.portalUrl) return;
    const url = `${window.location.origin}${item.portalUrl}`;
    void navigator.clipboard.writeText(url).then(() => {
      addToast({ type: "success", title: tr("toast_portal_copied", lang) });
    });
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
                "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
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
                      ? "brand-bg text-white"
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
            <Loader2 size={14} className="mr-2" />
            {lang === "en" ? "Retry" : "Erneut"}
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ClipboardCheck size={32} className="text-emerald-500" />
          <p className="max-w-md text-sm text-[color:var(--ds-text-muted)]">{tr("empty", lang)}</p>
        </div>
      )}

      {/* Review items list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.type];
            const typeLabel = TYPE_LABEL[item.type];
            const busy = actionMutation.isPending;
            return (
              <div
                key={item.id}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-[color:var(--brand-primary)]/30 hover:bg-[color:var(--ds-hover)]",
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
                            ? "border-red-500/20 bg-red-500/10 text-red-600"
                            : "border-amber-500/20 bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {item.urgency}
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
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "send",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Send size={12} />
                          )}
                          {tr("send", lang)}
                        </button>
                        {item.portalUrl && (
                          <button
                            onClick={() => copyPortalUrl(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)]"
                          >
                            <ArrowUpRight size={12} />
                            {tr("copy_portal", lang)}
                          </button>
                        )}
                      </>
                    )}
                    {item.type === "document_request" && item.status === "sent" && (
                      <button
                        onClick={() =>
                          void actionMutation.mutateAsync({
                            type: item.type,
                            action: "fulfilled",
                            item,
                          })
                        }
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
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
                        <button
                          onClick={() =>
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "approve",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
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
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "reject",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
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
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "reviewed",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
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
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "import_document",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/5 px-2 py-1 text-xs text-blue-600 transition-colors hover:bg-blue-500/10 disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <FileText size={12} />
                          )}
                          {lang === "en" ? "Import" : "Dokumente"}
                        </button>
                      </>
                    )}
                    {item.type === "suggested_party" && (
                      <>
                        <button
                          onClick={() =>
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "approve",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
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
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "reject",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
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
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "approve",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
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
                            void actionMutation.mutateAsync({
                              type: item.type,
                              action: "party_assertion",
                              item,
                            })
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-xs text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
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
