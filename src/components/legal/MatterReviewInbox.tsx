"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  Loader2,
  MessageCircle,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { DocumentRequestComposer } from "@/components/legal/DocumentRequestComposer";
import type { BrainPage } from "@/lib/types";
import type { MatterContextBundle, MatterUnderstandingPanel } from "@/lib/matter-context-types";
import type { DeadlineEntry } from "@/lib/legal-types";

type ReviewItemKind =
  | "client_submission"
  | "suggested_deadline"
  | "suggested_party"
  | "pending_fact"
  | "document_request"
  | "conversation";

interface ReviewItem {
  id: string;
  kind: ReviewItemKind;
  title: string;
  description: string;
  source: string;
  createdAt?: string;
  priority: "high" | "medium" | "low";
  actionLabel: string;
  secondaryLabel?: string;
  pageSlug?: string;
  requestSlug?: string;
  index?: number;
  factId?: string;
  statement?: string;
}

const KIND_ICON: Record<ReviewItemKind, ElementType> = {
  client_submission: MessageCircle,
  suggested_deadline: AlertTriangle,
  suggested_party: UserPlus,
  pending_fact: Sparkles,
  document_request: FileText,
  conversation: Inbox,
};

const PRIORITY_CLASS: Record<ReviewItem["priority"], string> = {
  high: "border-amber-500/30 bg-amber-500/5",
  medium: "border-blue-500/20 bg-blue-500/5",
  low: "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("de-DE");
}

function pageText(page: BrainPage): string {
  const fm = page.frontmatter ?? {};
  return String(fm.normalized_text ?? page.content ?? page.title ?? "").trim();
}

export function MatterReviewInbox({
  understanding,
}: {
  understanding: MatterUnderstandingPanel | null;
}) {
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const matter = ctx.caseData;
  const [bundle, setBundle] = useState<MatterContextBundle | null>(null);
  const [submissions, setSubmissions] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [composerSlug, setComposerSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!matter) return;
    setLoading(true);
    try {
      const [bundleResponse, submissionPages] = await Promise.all([
        fetch(`/api/matter-context/${encodeURIComponent(matter.slug)}`).then((res) =>
          res.ok ? (res.json() as Promise<MatterContextBundle>) : null
        ),
        api.brain.listPages({ type: "client_submission", limit: 100 }).catch(() => []),
      ]);
      setBundle(bundleResponse);
      setSubmissions(submissionPages.filter((page) => page.frontmatter?.case_slug === matter.slug));
    } finally {
      setLoading(false);
    }
  }, [matter]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo<ReviewItem[]>(() => {
    if (!matter) return [];
    const resolvedFacts = new Set(matter.knowledgeReviews.map((review) => review.fact_id));
    const pendingFacts =
      understanding?.facts.filter((fact) => !resolvedFacts.has(fact.id)).slice(0, 4) ?? [];

    const clientSubmissionItems = submissions
      .filter((page) => page.frontmatter?.review_status !== "reviewed")
      .map<ReviewItem>((page) => ({
        id: page.slug,
        kind: "client_submission",
        title: page.title || "Mandanten-Einreichung",
        description: pageText(page).slice(0, 180) || "Neue WhatsApp-Einreichung prüfen.",
        source: "WhatsApp / Mandant",
        createdAt: String(page.frontmatter?.created_at ?? page.created_at ?? ""),
        priority: "high",
        actionLabel: "Als geprüft markieren",
        secondaryLabel: "Dokumente",
        pageSlug: page.slug,
      }));

    const deadlineItems = (matter.suggestedDeadlines ?? [])
      .map((deadline, originalIndex) => ({ deadline, originalIndex }))
      .filter(({ deadline }) => !deadline.confirmed)
      .slice(0, 3)
      .map<ReviewItem>(({ deadline, originalIndex }) => ({
        id: `deadline-${originalIndex}-${deadline.title}`,
        kind: "suggested_deadline",
        title: deadline.title,
        description: `${deadline.due_date} · ${deadline.urgency}${deadline.source_quote ? ` · „${deadline.source_quote.slice(0, 90)}“` : ""}`,
        source: deadline.source,
        priority:
          deadline.urgency === "high" || deadline.urgency === "critical" ? "high" : "medium",
        actionLabel: "Übernehmen",
        secondaryLabel: "Verwerfen",
        index: originalIndex,
      }));

    const partyItems = (matter.suggestedParties ?? [])
      .map((party, originalIndex) => ({ party, originalIndex }))
      .filter(({ party }) => !party.confirmed)
      .slice(0, 3)
      .map<ReviewItem>(({ party, originalIndex }) => ({
        id: `party-${originalIndex}-${party.name}`,
        kind: "suggested_party",
        title: party.name,
        description: `${party.role} · als Kontakt/Partei einordnen`,
        source: party.source,
        priority: "medium",
        actionLabel: "Kontakt anlegen",
        secondaryLabel: "Verwerfen",
        index: originalIndex,
      }));

    const factItems = pendingFacts.map<ReviewItem>((fact) => ({
      id: `fact-${fact.id}`,
      kind: "pending_fact",
      title: "Neue Erkenntnis aus Analyse",
      description: fact.statement.slice(0, 180),
      source: fact.source,
      createdAt: fact.date,
      priority: fact.confidence === "high" ? "medium" : "low",
      actionLabel: "Bestätigen",
      secondaryLabel: "Behauptung",
      factId: fact.id,
      statement: fact.statement,
    }));

    const requestItems = (bundle?.document_requests ?? [])
      .filter((request) => request.status !== "fulfilled" && request.open_items.length > 0)
      .slice(0, 3)
      .map<ReviewItem>((request) => ({
        id: request.slug,
        kind: "document_request",
        title: "Offene Dokumentenanforderung",
        description: request.open_items.map((item) => item.label).join(", "),
        source: request.channel,
        createdAt: request.updated_at,
        priority: request.status === "draft" ? "medium" : "low",
        actionLabel: request.status === "draft" ? "Senden" : "Öffnen",
        secondaryLabel: request.status === "sent" ? "Erledigt" : undefined,
        requestSlug: request.slug,
      }));

    const conversationItems = (bundle?.conversation_events ?? [])
      .filter((event) => event.direction === "inbound" && event.status !== "executed")
      .slice(0, 3)
      .map<ReviewItem>((event) => ({
        id: event.slug,
        kind: "conversation",
        title: event.actor_name || "Neue Kommunikation",
        description: event.normalized_text?.slice(0, 180) || `${event.channel} prüfen`,
        source: event.channel,
        createdAt: event.created_at,
        priority: event.risk_level === "high" ? "high" : "low",
        actionLabel: "Kommunikation öffnen",
      }));

    return [
      ...clientSubmissionItems,
      ...deadlineItems,
      ...partyItems,
      ...factItems,
      ...requestItems,
      ...conversationItems,
    ].sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      const byPriority = priority[a.priority] - priority[b.priority];
      if (byPriority !== 0) return byPriority;
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });
  }, [bundle, matter, submissions, understanding]);

  if (!matter) return null;
  const visibleItems = items.slice(0, 8);

  async function markSubmissionReviewed(item: ReviewItem) {
    if (!item.pageSlug) return;
    setUpdating(item.id);
    try {
      const res = await fetch("/api/legal/submission-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionSlug: item.pageSlug,
          action: "reviewed",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Eingang konnte nicht aktualisiert werden"
        );
      }
      const reviewedAt = (data as { reviewedAt?: string }).reviewedAt ?? new Date().toISOString();
      setSubmissions((current) =>
        current.map((page) =>
          page.slug === item.pageSlug
            ? {
                ...page,
                frontmatter: {
                  ...(page.frontmatter ?? {}),
                  review_status: "reviewed",
                  reviewed_at: reviewedAt,
                  reviewed_by: (data as { reviewedBy?: string }).reviewedBy,
                },
              }
            : page
        )
      );
      addToast({ type: "success", title: "Eingang als geprüft markiert" });
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Eingang konnte nicht aktualisiert werden",
      });
    } finally {
      setUpdating(null);
    }
  }

  async function importSubmissionDocument(item: ReviewItem) {
    if (!item.pageSlug) return;
    setUpdating(`${item.id}:import`);
    try {
      const res = await fetch("/api/legal/submission-to-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionSlug: item.pageSlug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Dokument-Import fehlgeschlagen"
        );
      }
      addToast({
        type: "success",
        title: data.alreadyImported
          ? "Dokumente bereits importiert"
          : `Dokument importiert: ${data.documentTitle ?? "Datei"}`,
      });
      void load();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Dokument-Import fehlgeschlagen",
      });
    } finally {
      setUpdating(null);
    }
  }

  async function acceptSuggestedDeadline(item: ReviewItem) {
    if (typeof item.index !== "number" || !matter?.suggestedDeadlines?.[item.index]) return;
    const suggestion = matter.suggestedDeadlines[item.index];
    setUpdating(item.id);
    try {
      const entry: DeadlineEntry = {
        id: `dl-${Date.now()}`,
        title: suggestion.title,
        due_date: suggestion.due_date,
        status: "pending",
        type: "deadline",
        source: suggestion.source,
        description: suggestion.source_quote,
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
      };
      const updated = [...ctx.deadlinesList, entry];
      ctx.setDeadlinesList(updated);
      ctx.setCaseData({ ...matter, deadlines: updated });
      await ctx.saveCaseUpdate({ deadlines: updated });
      await ctx.confirmSuggestedDeadline(item.index, true);
      addToast({ type: "success", title: "Frist übernommen" });
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Frist konnte nicht übernommen werden",
      });
    } finally {
      setUpdating(null);
    }
  }

  async function rejectSuggestedDeadline(item: ReviewItem) {
    if (typeof item.index !== "number") return;
    setUpdating(item.id);
    try {
      await ctx.confirmSuggestedDeadline(item.index, false);
      addToast({ type: "success", title: "Fristvorschlag verworfen" });
    } finally {
      setUpdating(null);
    }
  }

  async function acceptSuggestedParty(item: ReviewItem) {
    if (typeof item.index !== "number" || !matter?.suggestedParties?.[item.index]) return;
    const suggestion = matter.suggestedParties[item.index];
    ctx.setContactDialogRole(
      suggestion.role === "mandant" || suggestion.role === "client"
        ? "client"
        : suggestion.role === "gegner" || suggestion.role === "opponent"
          ? "opponent"
          : suggestion.role === "gericht" || suggestion.role === "court"
            ? "court"
            : "other"
    );
    ctx.setContactDialogName(suggestion.name);
    ctx.setPendingSuggestedPartyIndex(item.index);
    ctx.setContactDialogOpen(true);
  }

  async function rejectSuggestedParty(item: ReviewItem) {
    if (typeof item.index !== "number") return;
    setUpdating(item.id);
    try {
      await ctx.confirmSuggestedParty(item.index, false);
      addToast({ type: "success", title: "Kontaktvorschlag verworfen" });
    } finally {
      setUpdating(null);
    }
  }

  async function reviewFact(
    item: ReviewItem,
    action: "approve" | "mark_party_assertion" | "reject"
  ) {
    if (!matter || !item.factId || !item.statement) return;
    setUpdating(`${item.id}:${action}`);
    try {
      const res = await fetch("/api/legal/matter-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseSlug: matter.slug,
          action,
          factId: item.factId,
          statement: item.statement,
          source: {
            type: "upload_analysis",
            label: item.source,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Erkenntnis konnte nicht geprüft werden"
        );
      }
      ctx.setCaseData({
        ...matter,
        knowledgeReviews: data.knowledgeReviews ?? matter.knowledgeReviews,
      });
      addToast({
        type: "success",
        title:
          action === "approve"
            ? "Erkenntnis bestätigt"
            : action === "mark_party_assertion"
              ? "Als Parteibehauptung markiert"
              : "Erkenntnis verworfen",
      });
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Erkenntnis konnte nicht geprüft werden",
      });
    } finally {
      setUpdating(null);
    }
  }

  async function updateDocumentRequest(item: ReviewItem, status: "sent" | "fulfilled") {
    if (!item.requestSlug) return;
    setUpdating(item.id);
    try {
      const res = await fetch("/api/document-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: item.requestSlug,
          status,
          sent_at: status === "sent" ? new Date().toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Dokumentenanfrage konnte nicht aktualisiert werden"
        );
      }
      addToast({
        type: "success",
        title:
          status === "sent"
            ? "Dokumentenanfrage versendet"
            : "Dokumentenanfrage als erledigt markiert",
      });
    } catch (err) {
      addToast({
        type: "error",
        title:
          err instanceof Error ? err.message : "Dokumentenanfrage konnte nicht aktualisiert werden",
      });
    } finally {
      setUpdating(null);
    }
  }

  function runItem(item: ReviewItem) {
    if (item.kind === "client_submission") {
      void markSubmissionReviewed(item);
    } else if (item.kind === "suggested_deadline") {
      void acceptSuggestedDeadline(item);
    } else if (item.kind === "suggested_party") {
      void acceptSuggestedParty(item);
    } else if (item.kind === "pending_fact") {
      void reviewFact(item, "approve");
    } else if (item.kind === "document_request") {
      if (item.requestSlug) {
        setComposerSlug(composerSlug === item.id ? null : item.id);
      } else {
        void updateDocumentRequest(item, "sent");
      }
    } else {
      window.location.href = "/dashboard/whatsapp";
    }
  }

  function runSecondary(item: ReviewItem) {
    if (item.kind === "client_submission") {
      void importSubmissionDocument(item);
    } else if (item.kind === "suggested_deadline") {
      void rejectSuggestedDeadline(item);
    } else if (item.kind === "suggested_party") {
      void rejectSuggestedParty(item);
    } else if (item.kind === "pending_fact") {
      void reviewFact(item, "mark_party_assertion");
    } else if (item.kind === "document_request") {
      void updateDocumentRequest(item, "fulfilled");
    }
  }

  const clientContact = ctx.contacts.find((c) => c.role === "client" || c.role === "mandant");
  const composerRequest = bundle?.document_requests?.find((r) => r.slug === composerSlug);

  return (
    <section
      aria-labelledby="matter-review-inbox-title"
      className="mt-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 md:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={16} className="brand-text" aria-hidden="true" />
            <h3
              id="matter-review-inbox-title"
              className="text-sm font-semibold text-[color:var(--ds-text)]"
            >
              Eingang prüfen
            </h3>
          </div>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Neue Einreichungen, KI-Vorschläge und offene Aktenpost an einem Ort.
          </p>
        </div>
        {loading ? (
          <Loader2 size={16} className="animate-spin text-[color:var(--ds-text-muted)]" />
        ) : (
          <Badge
            variant="default"
            className={cn(
              "px-2.5 py-1 text-xs",
              visibleItems.length
                ? "bg-amber-500/10 text-amber-700"
                : "bg-emerald-500/10 text-emerald-700"
            )}
          >
            {visibleItems.length} offen
          </Badge>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {!loading && visibleItems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">
            <CheckCircle2 size={15} aria-hidden="true" />
            Kein neuer prüfpflichtiger Eingang in dieser Akte.
          </div>
        ) : (
          visibleItems.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const showComposer =
              composerSlug === item.id && item.kind === "document_request" && composerRequest;
            return (
              <article
                key={item.id}
                className={cn("rounded-lg border p-3", PRIORITY_CLASS[item.priority])}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Icon
                      size={16}
                      className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                          {item.title}
                        </h4>
                        <span className="rounded-full bg-[color:var(--ds-hover)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--ds-text-muted)]">
                          {item.source}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                        {item.description}
                      </p>
                      {item.createdAt && (
                        <p className="mt-1 text-[10px] text-[color:var(--ds-text-subtle)]">
                          {formatDate(item.createdAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.secondaryLabel && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-10 gap-1.5 text-xs"
                        disabled={updating?.startsWith(item.id) || matter.status === "archived"}
                        onClick={() => runSecondary(item)}
                      >
                        {updating === `${item.id}:mark_party_assertion` ||
                        updating === `${item.id}:import` ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : item.kind === "pending_fact" ? (
                          <Sparkles size={13} aria-hidden="true" />
                        ) : item.kind === "document_request" ? (
                          <CheckCircle2 size={13} aria-hidden="true" />
                        ) : item.kind === "client_submission" ? (
                          <FileText size={13} aria-hidden="true" />
                        ) : (
                          <X size={13} aria-hidden="true" />
                        )}
                        {item.secondaryLabel}
                      </Button>
                    )}
                    {item.kind === "pending_fact" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-10 gap-1.5 text-xs text-red-600 hover:bg-red-500/10"
                        disabled={updating?.startsWith(item.id) || matter.status === "archived"}
                        onClick={() => void reviewFact(item, "reject")}
                      >
                        {updating === `${item.id}:reject` ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <X size={13} aria-hidden="true" />
                        )}
                        Verwerfen
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={item.priority === "high" ? "primary" : "outline"}
                      className="h-10 shrink-0 gap-1.5"
                      disabled={updating?.startsWith(item.id) || matter.status === "archived"}
                      onClick={() => runItem(item)}
                    >
                      {updating === item.id || updating === `${item.id}:approve` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : item.kind === "suggested_deadline" ||
                        item.kind === "pending_fact" ||
                        item.kind === "client_submission" ? (
                        <Check size={13} aria-hidden="true" />
                      ) : null}
                      {item.actionLabel}
                    </Button>
                  </div>
                </div>
                {showComposer && composerRequest && matter && (
                  <div className="mt-3">
                    <DocumentRequestComposer
                      slug={composerRequest.slug}
                      caseSlug={matter.slug}
                      messageDraft={composerRequest.open_items.map((i) => i.label).join(", ")}
                      portalUrl={composerRequest.portal_url}
                      items={composerRequest.open_items.map((i) => i.label)}
                      recipientPhone={clientContact?.phone}
                      recipientEmail={clientContact?.email}
                      onSent={() => {
                        void load();
                        setComposerSlug(null);
                      }}
                      onFulfilled={() => {
                        void load();
                        setComposerSlug(null);
                      }}
                      onClose={() => setComposerSlug(null)}
                    />
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
