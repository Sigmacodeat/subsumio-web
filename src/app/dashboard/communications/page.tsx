"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Landmark,
  Mail,
  MessageSquareText,
  RefreshCw,
  Search,
  User,
  X,
  Inbox as InboxIcon,
  Zap,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { triageBatch, type TriageInput, type TriageCard } from "@/lib/triage";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewInboxTab } from "@/components/dashboard/review-inbox-tab";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import type { BrainPage } from "@/lib/types";

type Channel = "all" | "bea" | "whatsapp" | "email" | "portal";

interface UnifiedMessage {
  slug: string;
  title: string;
  channel: "bea" | "whatsapp" | "email" | "portal";
  body: string;
  sender: string;
  caseSlug?: string;
  createdAt: string;
  read?: boolean;
}

const CHANNEL_ICON: Record<UnifiedMessage["channel"], React.ElementType> = {
  bea: Landmark,
  whatsapp: MessageSquareText,
  email: Mail,
  portal: User,
};

const CHANNEL_LABEL: Record<UnifiedMessage["channel"], { de: string; en: string }> = {
  bea: { de: "beA", en: "beA" },
  whatsapp: { de: "WhatsApp", en: "WhatsApp" },
  email: { de: "E-Mail", en: "Email" },
  portal: { de: "Portal", en: "Portal" },
};

const CHANNEL_BADGE: Record<UnifiedMessage["channel"], string> = {
  bea: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  whatsapp:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  email: "border-violet-500/20 bg-violet-500/10 text-violet-600",
  portal:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
};

const URGENCY_STYLES: Record<string, string> = {
  critical:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  high: "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  medium:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  low: "border-slate-500/20 bg-slate-500/10 text-slate-600",
};

function extractMessages(pagesByType: Record<string, BrainPage[]>): UnifiedMessage[] {
  const messages: UnifiedMessage[] = [];

  for (const page of pagesByType.bea_message ?? []) {
    const fm = page.frontmatter as Record<string, unknown>;
    messages.push({
      slug: page.slug,
      title: page.title,
      channel: "bea",
      body: (page.content as string) || (fm.body as string) || (fm.summary as string) || "",
      sender: (fm.sender as string) || (fm.from as string) || "—",
      caseSlug: fm.case_slug as string | undefined,
      createdAt: (fm.created_at as string) || (fm.date as string) || "",
      read: fm.read as boolean | undefined,
    });
  }

  for (const page of pagesByType.portal_message ?? []) {
    const fm = page.frontmatter as Record<string, unknown>;
    messages.push({
      slug: page.slug,
      title: page.title,
      channel: "portal",
      body: (page.content as string) || (fm.message as string) || "",
      sender: (fm.sender as string) || (fm.author as string) || "Mandant",
      caseSlug: fm.case_slug as string | undefined,
      createdAt: (fm.created_at as string) || "",
      read: fm.read as boolean | undefined,
    });
  }

  for (const page of pagesByType.activity_event ?? []) {
    const fm = page.frontmatter as Record<string, unknown>;
    const type = fm.type as string;
    if (type === "email_received" || type === "email_sent") {
      messages.push({
        slug: page.slug,
        title: page.title,
        channel: "email",
        body: (fm.description as string) || (page.content as string) || "",
        sender: (fm.actor as string) || (fm.from as string) || "—",
        caseSlug: fm.case_slug as string | undefined,
        createdAt: (fm.timestamp as string) || (fm.created_at as string) || "",
      });
    } else if (
      type === "call" ||
      (typeof fm.description === "string" && fm.description.toLowerCase().includes("whatsapp"))
    ) {
      messages.push({
        slug: page.slug,
        title: page.title,
        channel: "whatsapp",
        body: (fm.description as string) || (page.content as string) || "",
        sender: (fm.actor as string) || "—",
        caseSlug: fm.case_slug as string | undefined,
        createdAt: (fm.timestamp as string) || (fm.created_at as string) || "",
      });
    }
  }

  return messages.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (Number.isNaN(tb) && !Number.isNaN(ta)) return -1;
    if (Number.isNaN(ta) && !Number.isNaN(tb)) return 1;
    return tb - ta;
  });
}

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
  title: { de: "Kommunikation", en: "Communications" },
  description: {
    de: "Unified Inbox für beA, WhatsApp, E-Mail und Mandantenportal — alle Nachrichten an einem Ort.",
    en: "Unified inbox for beA, WhatsApp, email and client portal — all messages in one place.",
  },
  refresh: { de: "Aktualisieren", en: "Refresh" },
  all: { de: "Alle", en: "All" },
  search_placeholder: { de: "Nachrichten durchsuchen…", en: "Search messages…" },
  empty: {
    de: "Keine Nachrichten vorhanden. Sobald beA-, WhatsApp-, E-Mail- oder Portal-Nachrichten eingehen, erscheinen sie hier.",
    en: "No messages yet. Once beA, WhatsApp, email or portal messages arrive, they will appear here.",
  },
  error: { de: "Nachrichten konnten nicht geladen werden.", en: "Failed to load messages." },
  unread: { de: "ungelesen", en: "unread" },
  to_case: { de: "Zur Akte", en: "To case" },
  mark_read: { de: "Als gelesen markieren", en: "Mark as read" },
  mark_unread: { de: "Als ungelesen markieren", en: "Mark as unread" },
  triage_title: { de: "KI-Triage", en: "AI Triage" },
  triage_accept: { de: "Akzeptieren", en: "Accept" },
  triage_reject: { de: "Ablehnen", en: "Reject" },
  triage_dismiss: { de: "Verwerfen", en: "Dismiss" },
  triage_deadline: { de: "Frist erstellen", en: "Create deadline" },
  triage_assign: { de: "Akte zuweisen", en: "Assign to case" },
  toast_read: { de: "Nachrichtenstatus aktualisiert", en: "Message status updated" },
  toast_triage: { de: "Triage-Aktion ausgeführt", en: "Triage action completed" },
  toast_error: { de: "Aktion fehlgeschlagen", en: "Action failed" },
};

function tr(key: string, lang: Lang): string {
  const entry = I18N[key];
  return entry ? (lang === "en" ? entry.en : entry.de) : key;
}

type View = "messages" | "review";

export default function CommunicationsPage() {
  const { lang } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<View>("messages");
  const [channel, setChannel] = useState<Channel>("all");
  const [search, setSearch] = useState("");

  // Deep link: /dashboard/communications?view=review opens the review inbox
  // directly (used by sidebar badge + dashboard action banner).
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "review" || requested === "messages") setView(requested);
  }, []);

  const batchQuery = useQuery({
    queryKey: ["communications", "batch"],
    queryFn: () =>
      api.brain.batchListPages(["bea_message", "portal_message", "activity_event"], 200),
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: api.inbox.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communications", "batch"] });
      addToast({ type: "success", title: tr("toast_read", lang) });
    },
    onError: () => {
      addToast({ type: "error", title: tr("toast_error", lang) });
    },
  });

  const triageActionMutation = useMutation({
    mutationFn: api.triage.action,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communications", "batch"] });
      addToast({ type: "success", title: tr("toast_triage", lang) });
    },
    onError: () => {
      addToast({ type: "error", title: tr("toast_error", lang) });
    },
  });

  const allMessages = useMemo(
    () => (batchQuery.data ? extractMessages(batchQuery.data) : []),
    [batchQuery.data]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allMessages.length };
    for (const m of allMessages) {
      c[m.channel] = (c[m.channel] || 0) + 1;
    }
    return c;
  }, [allMessages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMessages.filter((m) => {
      if (channel !== "all" && m.channel !== channel) return false;
      if (!q) return true;
      const haystack = [m.title, m.body, m.sender, m.channel].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [allMessages, channel, search]);

  const triageMap = useMemo(() => {
    if (filtered.length === 0) return new Map<string, TriageCard>();
    const inputs: TriageInput[] = filtered.map((m) => ({
      source: m.channel as TriageInput["source"],
      subject: m.title,
      body: m.body,
      sender: m.sender,
      date: m.createdAt,
      rawSlug: m.slug,
    }));
    const cards = triageBatch(inputs);
    return new Map(cards.map((c) => [c.rawSlug, c]));
  }, [filtered]);

  const triageSummary = useMemo(() => {
    const cards = [...triageMap.values()];
    return {
      critical: cards.filter((c) => c.urgency === "critical").length,
      high: cards.filter((c) => c.urgency === "high").length,
      medium: cards.filter((c) => c.urgency === "medium").length,
      low: cards.filter((c) => c.urgency === "low").length,
    };
  }, [triageMap]);

  const loading = batchQuery.isLoading;
  const error = batchQuery.isError;

  const tabs: Array<{ key: Channel; icon: React.ElementType; label: string }> = [
    { key: "all", icon: InboxIcon, label: tr("all", lang) },
    { key: "bea", icon: Landmark, label: "beA" },
    { key: "whatsapp", icon: MessageSquareText, label: "WhatsApp" },
    { key: "email", icon: Mail, label: lang === "en" ? "Email" : "E-Mail" },
    { key: "portal", icon: User, label: lang === "en" ? "Portal" : "Portal" },
  ];

  const VIEW_TABS: Array<{ key: View; label: string; icon: React.ElementType }> = [
    { key: "messages", label: lang === "en" ? "Messages" : "Nachrichten", icon: InboxIcon },
    { key: "review", label: lang === "en" ? "Review" : "Eingang prüfen", icon: ClipboardCheck },
  ];

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={tr("title", lang)}
        description={tr("description", lang)}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: tr("title", lang) }]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              view === "messages"
                ? void batchQuery.refetch()
                : void qc.invalidateQueries({ queryKey: ["review-inbox"] })
            }
            className="gap-2 text-xs"
          >
            <RefreshCw size={14} />
            {tr("refresh", lang)}
          </Button>
        }
      />

      {/* View toggle: Messages vs Review */}
      <div className="flex items-center gap-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-1">
        {VIEW_TABS.map((tab) => {
          const isActive = view === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "brand-bg text-white"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Review Inbox Tab */}
      {view === "review" && <ReviewInboxTab />}

      {/* Messages view */}
      {view === "messages" && (
        <>
          {/* Info banner */}
          <div
            className="brand-border brand-soft/5 flex items-start gap-3 rounded-xl border px-4 py-3"
            role="note"
          >
            <AlertCircle size={16} className="brand-text mt-0.5 shrink-0" aria-hidden="true" />
            <p className="brand-text/90 text-xs leading-relaxed">{tr("description", lang)}</p>
          </div>

          {/* Channel tabs */}
          <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--ds-border)]">
            {tabs.map((tab) => {
              const isActive = channel === tab.key;
              const count = counts[tab.key] || 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setChannel(isActive ? "all" : tab.key)}
                  className={cn(
                    "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "border-[color:var(--brand-primary)] font-medium text-[color:var(--ds-text)]"
                      : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  )}
                >
                  <tab.icon size={15} />
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

          {/* Search */}
          {!loading && allMessages.length > 0 && (
            <div className="relative">
              <Search
                size={15}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("search_placeholder", lang)}
                aria-label={tr("search_placeholder", lang)}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-9 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertCircle size={32} className="text-[color:var(--ds-text-muted)]" />
              <p className="text-sm text-[color:var(--ds-text-muted)]">{tr("error", lang)}</p>
              <Button variant="ghost" size="sm" onClick={() => void batchQuery.refetch()}>
                <RefreshCw size={14} className="mr-2" />
                {tr("refresh", lang)}
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <InboxIcon size={32} className="text-[color:var(--ds-text-muted)]" />
              <p className="max-w-md text-sm text-[color:var(--ds-text-muted)]">
                {tr("empty", lang)}
              </p>
            </div>
          )}

          {/* KI-Triage Summary Banner */}
          {!loading &&
            !error &&
            filtered.length > 0 &&
            triageSummary.critical + triageSummary.high > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="brand-text" />
                  <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {tr("triage_title", lang)}
                  </span>
                </div>
                {triageSummary.critical > 0 && (
                  <Badge
                    variant="default"
                    className="border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                  >
                    {triageSummary.critical} {lang === "en" ? "critical" : "kritisch"}
                  </Badge>
                )}
                {triageSummary.high > 0 && (
                  <Badge
                    variant="default"
                    className="border border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-xs text-[color:var(--ds-attention-text)]"
                  >
                    {triageSummary.high} {lang === "en" ? "high" : "hoch"}
                  </Badge>
                )}
                {triageSummary.medium > 0 && (
                  <Badge
                    variant="default"
                    className="border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-xs text-[color:var(--ds-warning-text)]"
                  >
                    {triageSummary.medium} {lang === "en" ? "medium" : "mittel"}
                  </Badge>
                )}
              </div>
            )}

          {/* Message list */}
          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((msg) => {
                const Icon = CHANNEL_ICON[msg.channel];
                const chLabel = CHANNEL_LABEL[msg.channel];
                const card = triageMap.get(msg.slug);
                return (
                  <div
                    key={msg.slug}
                    className={cn(
                      "group flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-[color:var(--brand-primary)]/30 hover:bg-[color:var(--ds-hover)]",
                      !msg.read && "border-l-2 border-l-[color:var(--brand-primary)]",
                      card?.urgency === "critical" &&
                        "border-l-2 border-l-[color:var(--ds-danger-solid)]",
                      card?.urgency === "high" &&
                        "border-l-2 border-l-[color:var(--ds-attention-solid)]"
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
                            CHANNEL_BADGE[msg.channel]
                          )}
                        >
                          {lang === "en" ? chLabel.en : chLabel.de}
                        </span>
                        {!msg.read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand-primary)]" />
                        )}
                        {card && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                              URGENCY_STYLES[card.urgency]
                            )}
                          >
                            {card.urgency}
                          </span>
                        )}
                        {card?.actionType && card.actionType !== "info" && (
                          <span className="shrink-0 rounded-full border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-primary)]/5 px-2 py-0.5 text-xs font-medium text-[color:var(--brand-primary)]">
                            {card.actionType}
                          </span>
                        )}
                        {card?.deadline && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-[color:var(--ds-danger-text)]">
                            <AlertTriangle size={10} />
                            {card.deadline}
                          </span>
                        )}
                        <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {msg.title}
                        </span>
                      </div>
                      {msg.body && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                          {msg.body}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                        <span>{msg.sender}</span>
                        {msg.createdAt && <span>{timeLabel(lang, msg.createdAt)}</span>}
                        {msg.caseSlug && (
                          <Link
                            href={`/dashboard/cases/${msg.caseSlug}`}
                            className="inline-flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                          >
                            {tr("to_case", lang)}
                            <ArrowUpRight size={11} />
                          </Link>
                        )}
                      </div>
                      {/* Triage Actions */}
                      {card && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() =>
                              void triageActionMutation.mutateAsync({
                                slug: msg.slug,
                                action: "accept",
                              })
                            }
                            disabled={triageActionMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-2 py-1 text-xs text-[color:var(--ds-success-text)] transition-colors hover:bg-[color:var(--ds-success-bg)] disabled:opacity-50"
                          >
                            <CheckCircle2 size={12} />
                            {tr("triage_accept", lang)}
                          </button>
                          <button
                            onClick={() =>
                              void triageActionMutation.mutateAsync({
                                slug: msg.slug,
                                action: "reject",
                              })
                            }
                            disabled={triageActionMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2 py-1 text-xs text-[color:var(--ds-danger-text)] transition-colors hover:bg-[color:var(--ds-danger-bg)] disabled:opacity-50"
                          >
                            <Ban size={12} />
                            {tr("triage_reject", lang)}
                          </button>
                          {card.deadline && (
                            <button
                              onClick={() =>
                                void triageActionMutation.mutateAsync({
                                  slug: msg.slug,
                                  action: "create_deadline",
                                  deadline_date: card.deadline,
                                  deadline_label: msg.title,
                                })
                              }
                              disabled={triageActionMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] px-2 py-1 text-xs text-[color:var(--ds-attention-text)] transition-colors hover:bg-[color:var(--ds-attention-bg)] disabled:opacity-50"
                            >
                              <Clock size={12} />
                              {tr("triage_deadline", lang)}
                            </button>
                          )}
                          <button
                            onClick={() =>
                              void triageActionMutation.mutateAsync({
                                slug: msg.slug,
                                action: "dismiss",
                              })
                            }
                            disabled={triageActionMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] disabled:opacity-50"
                          >
                            <X size={12} />
                            {tr("triage_dismiss", lang)}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Mark read/unread */}
                    <button
                      onClick={() =>
                        void markReadMutation.mutateAsync({
                          slug: msg.slug,
                          read: !msg.read,
                        })
                      }
                      disabled={markReadMutation.isPending}
                      className="shrink-0 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
                      title={msg.read ? tr("mark_unread", lang) : tr("mark_read", lang)}
                      aria-label={msg.read ? tr("mark_unread", lang) : tr("mark_read", lang)}
                    >
                      {msg.read ? <Mail size={14} /> : <Check size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
