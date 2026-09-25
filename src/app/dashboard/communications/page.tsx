"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Loader2,
  MoreHorizontal,
  Reply,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useSidebarBadges } from "@/lib/queries/sidebar-badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { triageBatch, type TriageInput, type TriageCard } from "@/lib/triage";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewInboxTab } from "@/components/dashboard/review-inbox-tab";
import { api } from "@/lib/api";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import type { BrainPage } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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
  /** A client's portal message the firm can answer in the portal. */
  portalReplyable?: boolean;
}

const CHANNEL_ICON: Record<UnifiedMessage["channel"], React.ElementType> = {
  bea: Landmark,
  whatsapp: MessageSquareText,
  email: Mail,
  portal: User,
};

const CHANNEL_LABEL: Record<UnifiedMessage["channel"], { de: string; en: string }> = {
  bea: { de: "Elektronischer Rechtsverkehr", en: "Electronic court filing" },
  whatsapp: { de: "WhatsApp", en: "WhatsApp" },
  email: { de: "E-Mail", en: "Email" },
  portal: { de: "Portal", en: "Portal" },
};

const CHANNEL_BADGE: Record<UnifiedMessage["channel"], string> = {
  bea: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  whatsapp:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  email:
    "border-[color:var(--ds-category-violet-border)] bg-[color:var(--ds-category-violet-bg)] text-[color:var(--ds-category-violet-text)]",
  portal:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
};

const URGENCY_STYLES: Record<string, string> = {
  critical:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  high: "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  medium:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  low: "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
};

const URGENCY_LABEL: Record<string, string> = {
  critical: "Kritisch",
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};
const ACTION_LABEL: Record<string, string> = {
  frist: "Frist",
  termin: "Termin",
  antwort: "Antwort nötig",
  dokument: "Dokument",
  zahlung: "Zahlung",
  info: "Information",
  konflikt: "Kollision",
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
      sender:
        fm.sender === "lawyer"
          ? `Kanzlei${fm.author ? ` (${String(fm.author)})` : ""}`
          : fm.sender === "client" || !fm.sender
            ? "Mandant"
            : String(fm.sender),
      portalReplyable: fm.sender !== "lawyer" && typeof fm.case_slug === "string",
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
  // formatRelativeTime renders German wording and falls back to TT.MM.JJJJ after a week.
  if (lang === "en") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB");
  }
  return formatRelativeTime(value);
}

/** Triage deadlines arrive as TT.MM.JJJJ or ISO; normalise to TT.MM.JJJJ. */
const MUTED_DISMISS_KEY = "whatsapp-muted-dismissed-at";

function deadlineLabel(value: string): string {
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) return value;
  const out = formatDate(value);
  return out === "—" ? value : out;
}

const I18N: Record<string, { de: string; en: string }> = {
  title: { de: "Kommunikation", en: "Communications" },
  description: {
    de: "WhatsApp, E-Mail und Mandantenportal — alle Nachrichten an einem Ort.",
    en: "Unified inbox for WhatsApp, email and client portal — all messages in one place.",
  },
  refresh: { de: "Aktualisieren", en: "Refresh" },
  all: { de: "Alle", en: "All" },
  search_placeholder: { de: "Nachrichten durchsuchen…", en: "Search messages…" },
  empty_title: { de: "Keine Nachrichten", en: "No messages" },
  empty: {
    de: "Sobald WhatsApp-, E-Mail- oder Portal-Nachrichten eingehen, erscheinen sie hier.",
    en: "Once WhatsApp, email or portal messages arrive, they will appear here.",
  },
  empty_filtered: {
    de: "Keine Nachricht entspricht Kanal oder Suchbegriff.",
    en: "No message matches the channel or search term.",
  },
  empty_review_action: { de: "Eingang prüfen", en: "Review intake" },
  empty_connect_action: { de: "E-Mails importieren", en: "Import emails" },
  error: { de: "Nachrichten konnten nicht geladen werden.", en: "Failed to load messages." },
  unread: { de: "ungelesen", en: "unread" },
  to_case: { de: "Zur Akte", en: "To case" },
  mark_read: { de: "Als gelesen markieren", en: "Mark as read" },
  mark_unread: { de: "Als ungelesen markieren", en: "Mark as unread" },
  triage_title: { de: "Dringlichkeit", en: "Urgency" },
  triage_accept: { de: "Einordnung übernehmen", en: "Accept" },
  triage_reject: { de: "Einordnung ablehnen", en: "Reject" },
  triage_dismiss: { de: "Nachricht verwerfen", en: "Dismiss" },
  more_actions: { de: "Weitere Aktionen", en: "More actions" },
  triage_deadline: { de: "Frist erstellen", en: "Create deadline" },
  triage_assign: { de: "Akte zuweisen", en: "Assign to case" },
  toast_read: { de: "Nachrichtenstatus aktualisiert", en: "Message status updated" },
  toast_triage: { de: "Einordnung gespeichert", en: "Triage action completed" },
  toast_error: { de: "Aktion fehlgeschlagen", en: "Action failed" },
};

function tr(key: string, lang: Lang): string {
  const entry = I18N[key];
  return entry ? (lang === "en" ? entry.en : entry.de) : key;
}

type View = "messages" | "review";

export default function CommunicationsPage() {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [assignTarget, setAssignTarget] = useState<UnifiedMessage | null>(null);
  const [assignCase, setAssignCase] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<UnifiedMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyBill, setReplyBill] = useState(false);
  const [replyBillMinutes, setReplyBillMinutes] = useState("6");
  const [view, setView] = useState<View>("messages");
  const [channel, setChannel] = useState<Channel>("all");
  const [search, setSearch] = useState("");

  // Deep link: /dashboard/communications?view=review opens the review inbox
  // directly (used by sidebar badge + dashboard action banner).
  const explicitView = useRef(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "review" || requested === "messages") {
      explicitView.current = true;
      setView(requested);
    }
  }, []);

  // The sidebar badge on "Kommunikation" counts open review-inbox items, not
  // messages. Surface that same number on the "Eingang prüfen" segment.
  const router = useRouter();
  const badgesQuery = useSidebarBadges();
  // Same query key as ReviewInboxTab, so the list is fetched once and the count
  // on the segment always matches what the tab shows. The sidebar badge is only
  // a fallback while the list loads (its server-side count can differ).
  const reviewQuery = useQuery({
    queryKey: ["review-inbox"],
    queryFn: () => api.reviewInbox.list(),
    staleTime: 30_000,
  });
  const reviewCount = reviewQuery.data
    ? (reviewQuery.data.items?.length ?? 0)
    : (badgesQuery.data?.["/dashboard/communications"]?.count ?? 0);

  const batchQuery = useQuery({
    queryKey: ["communications", "batch"],
    queryFn: () =>
      api.brain
        .batchListPagesDetailed(["bea_message", "portal_message", "activity_event"], 200)
        .then((r) => {
          if (r.errors.length) throw new Error(`batch list failed: ${r.errors.join(",")}`);
          return r.results;
        }),
    staleTime: 30_000,
  });

  // Stumme Opt-out-Eingänge: auditiert, aber bewusst nicht zugestellt.
  const mutedQuery = useQuery({
    queryKey: ["whatsapp-muted"],
    queryFn: api.whatsapp.muted,
    staleTime: 60_000,
  });
  const mutedCount = mutedQuery.data?.count ?? 0;
  const mutedLastAt = mutedQuery.data?.lastAt ?? null;
  const mutedSnippets = mutedQuery.data?.snippets;
  const [mutedOpen, setMutedOpen] = useState(false);
  // „Zur Kenntnis genommen": Banner bleibt weg, bis ein neuer Muted-
  // Eingang lastAt ändert — kein dauerhaftes Warn-Rauschen.
  const [mutedDismissedAt, setMutedDismissedAt] = useState<string | null>(null);
  useEffect(() => {
    try {
      setMutedDismissedAt(localStorage.getItem(MUTED_DISMISS_KEY));
    } catch {
      /* localStorage unavailable (SSR/private mode) */
    }
  }, []);
  const mutedVisible = mutedCount > 0 && String(mutedLastAt ?? "none") !== mutedDismissedAt;
  const dismissMuted = () => {
    const stamp = mutedLastAt ?? "none";
    try {
      localStorage.setItem(MUTED_DISMISS_KEY, stamp);
    } catch {
      /* noop */
    }
    setMutedDismissedAt(stamp);
  };

  // Mail from connected firm mailboxes lives in the mailbox table, not in brain pages.
  const mailQuery = useQuery({
    queryKey: ["communications", "mail"],
    queryFn: async (): Promise<UnifiedMessage[]> => {
      const res = await fetch("/api/email/messages?folder=inbox&limit=100");
      // A failed mailbox read is an error, not an empty mailbox.
      if (!res.ok) throw new Error(`mail list failed: HTTP ${res.status}`);
      const json = await res.json();
      const list = (json?.data?.messages ?? json?.messages ?? []) as Array<Record<string, unknown>>;
      return list
        .filter((m) => m.direction === "inbound")
        .map((m) => ({
          slug: `mail:${String(m.id)}`,
          title: String(m.subject || "(ohne Betreff)"),
          channel: "email" as const,
          body: String(m.text ?? ""),
          sender: m.fromName
            ? `${String(m.fromName)} <${String(m.fromEmail)}>`
            : String(m.fromEmail),
          caseSlug: typeof m.caseSlug === "string" ? m.caseSlug : undefined,
          createdAt: String(m.createdAt ?? ""),
          read: Boolean(m.isRead),
        }));
    },
    staleTime: 30_000,
  });

  async function patchMail(slug: string, patch: Record<string, unknown>) {
    const res = await csrfFetch(`/api/email/messages/${encodeURIComponent(slug.slice(5))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("E-Mail konnte nicht aktualisiert werden");
    await mailQuery.refetch();
  }

  const markReadMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.inbox.markRead>[0]) =>
      input.slug.startsWith("mail:")
        ? patchMail(input.slug, { isRead: input.read }).then(() => ({ success: true }))
        : api.inbox.markRead(input),
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

  const { data: cases = [] } = useQuery({
    queryKey: ["communications-cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
  });

  async function sendPortalReply() {
    const text = replyText.trim();
    if (!replyTarget?.caseSlug || !text) return;
    setReplyBusy(true);
    const billMinutes = replyBill
      ? Math.max(1, Math.min(600, Math.round(Number(replyBillMinutes) || 0)))
      : 0;
    try {
      const res = await csrfFetch("/api/portal/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: replyTarget.caseSlug,
          message: text,
          ...(billMinutes > 0 ? { bill_minutes: billMinutes } : {}),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error?.message ?? json?.message ?? "Antwort konnte nicht gesendet werden"
        );
      }
      const json = (await res.json().catch(() => null)) as { billed?: boolean } | null;
      addToast({
        type: billMinutes > 0 && json?.billed === false ? "warning" : "success",
        title:
          billMinutes > 0
            ? json?.billed === false
              ? "Antwort gesendet — Zeiteintrag fehlgeschlagen"
              : `Antwort gesendet und ${billMinutes} Min verbucht`
            : "Antwort steht im Mandantenportal",
      });
      setReplyTarget(null);
      setReplyText("");
      setReplyBill(false);
      setReplyBillMinutes("6");
      await batchQuery.refetch();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Antwort konnte nicht gesendet werden",
      });
    } finally {
      setReplyBusy(false);
    }
  }

  async function assignToCase(msg: UnifiedMessage, caseSlug: string) {
    if (!caseSlug) return;
    setAssignBusy(true);
    try {
      if (msg.slug.startsWith("mail:")) {
        await patchMail(msg.slug, { case_slug: caseSlug });
        addToast({ type: "success", title: "E-Mail der Akte zugewiesen" });
        setAssignTarget(null);
        setAssignCase("");
        return;
      }
      await api.brain.updatePage({
        slug: msg.slug,
        frontmatter: {
          case_slug: caseSlug,
          assigned_at: new Date().toISOString(),
        },
      });
      addToast({ type: "success", title: "Nachricht der Akte zugewiesen" });
      await batchQuery.refetch();
      setAssignTarget(null);
      setAssignCase("");
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Zuweisung fehlgeschlagen",
      });
    } finally {
      setAssignBusy(false);
    }
  }

  const allMessages = useMemo(() => {
    const pages = batchQuery.data ? extractMessages(batchQuery.data) : [];
    return [...pages, ...(mailQuery.data ?? [])].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }, [batchQuery.data, mailQuery.data]);

  // Opened without ?view: when there are no messages but items await review,
  // show the review inbox so the sidebar badge leads somewhere meaningful.
  const autoSwitched = useRef(false);
  useEffect(() => {
    if (explicitView.current || autoSwitched.current) return;
    if (batchQuery.isLoading || mailQuery.isLoading || reviewQuery.isLoading) return;
    autoSwitched.current = true;
    if (allMessages.length === 0 && reviewCount > 0) setView("review");
  }, [
    allMessages.length,
    reviewCount,
    batchQuery.isLoading,
    mailQuery.isLoading,
    reviewQuery.isLoading,
  ]);

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
    { key: "whatsapp", icon: MessageSquareText, label: "WhatsApp" },
    { key: "email", icon: Mail, label: lang === "en" ? "Email" : "E-Mail" },
    { key: "portal", icon: User, label: lang === "en" ? "Portal" : "Portal" },
  ];

  const VIEW_TABS: Array<{ key: View; label: string; icon: React.ElementType; count: number }> = [
    {
      key: "messages",
      label: lang === "en" ? "Messages" : "Nachrichten",
      icon: InboxIcon,
      count: allMessages.length,
    },
    {
      key: "review",
      label: lang === "en" ? "Review" : "Eingang prüfen",
      icon: ClipboardCheck,
      count: reviewCount,
    },
  ];

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={tr("title", lang)}
        description={tr("description", lang)}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: tr("title", lang) },
        ]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              view === "messages"
                ? void Promise.all([batchQuery.refetch(), mailQuery.refetch()])
                : view === "review"
                  ? void qc.invalidateQueries({ queryKey: ["review-inbox"] })
                  : undefined
            }
            className="gap-2 text-xs"
          >
            <RefreshCw size={14} />
            {tr("refresh", lang)}
          </Button>
        }
      />

      {/* View toggle: Messages vs Review */}
      <div
        role="tablist"
        aria-label={lang === "en" ? "View" : "Ansicht"}
        className="inline-flex items-center gap-0.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-0.5"
      >
        {VIEW_TABS.map((tab) => {
          const isActive = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setView(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-[var(--ds-duration-fast)] motion-reduce:transition-none",
                isActive
                  ? "bg-[color:var(--ds-surface)] font-medium text-[color:var(--ds-text)] shadow-sm"
                  : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <tab.icon size={14} aria-hidden="true" />
              {tab.label}
              {tab.count > 0 && (
                <span className="rounded-full bg-[color:var(--ds-surface-2)] px-1.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Review Inbox Tab */}
      {view === "review" && <ReviewInboxTab />}

      {/* Messages view */}
      {view === "messages" && (
        <>
          {/* Channel tabs — only once there is something to filter */}
          {(loading || allMessages.length > 0) && (
            <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--ds-border)]">
              {tabs.map((tab) => {
                const isActive = channel === tab.key;
                const count = counts[tab.key] || 0;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setChannel(isActive ? "all" : tab.key)}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none",
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
          )}

          {/* Opt-out-Hinweis: eingegangene Nachrichten abgemeldeter Nummern
              werden auditiert, aber nicht zugestellt — diskret sichtbar. */}
          {mutedVisible && (channel === "all" || channel === "whatsapp") && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
            >
              <MessageSquareText size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                {lang === "en"
                  ? `${mutedCount} inbound WhatsApp ${mutedCount === 1 ? "message" : "messages"} from opted-out numbers were not delivered (logged only).`
                  : `${mutedCount} eingegangene WhatsApp-${mutedCount === 1 ? "Nachricht" : "Nachrichten"} von abgemeldeten Nummern ${mutedCount === 1 ? "wurde" : "wurden"} nicht zugestellt (nur protokolliert).`}
                {mutedLastAt && (
                  <span className="ml-1 text-[color:var(--ds-text-muted)]">
                    {lang === "en"
                      ? `Last: ${timeLabel(lang, mutedLastAt)}`
                      : `Zuletzt: ${timeLabel(lang, mutedLastAt)}`}
                  </span>
                )}
                {/* Snippet-Drilldown nur für Admins (Server filtert) —
                    Kurzausschnitte zur rechtserheblichen Einordnung. */}
                {mutedSnippets && mutedSnippets.length > 0 && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => setMutedOpen((v) => !v)}
                      aria-expanded={mutedOpen}
                      className="ml-1 inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:text-[color:var(--ds-text)] focus-visible:outline-2 focus-visible:outline-[color:var(--ds-ring)]"
                    >
                      {lang === "en" ? "details" : "Details"}
                    </button>
                    {mutedOpen && (
                      <ul className="mt-1.5 space-y-1 border-l-2 border-[color:var(--ds-warning-border)] pl-2">
                        {mutedSnippets.map((s, i) => (
                          <li key={`${s.at}-${i}`} className="text-[color:var(--ds-text-muted)]">
                            <span className="text-[color:var(--ds-text-subtle)]">
                              {timeLabel(lang, s.at)}
                              {s.type ? ` · ${s.type}` : ""}
                              {s.sender && (
                                <>
                                  {" · "}
                                  <code
                                    className="rounded bg-[color:var(--ds-surface-2)] px-1 font-mono text-[10px]"
                                    title={
                                      lang === "en"
                                        ? "pseudonymous sender tag (repeat messages from the same number share it)"
                                        : "pseudonymes Absender-Kürzel (Wiederholer erkennbar)"
                                    }
                                  >
                                    …{s.sender}
                                  </code>
                                </>
                              )}
                            </span>
                            {s.snippet && <span className="block italic">„{s.snippet}“</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={dismissMuted}
                aria-label={lang === "en" ? "Dismiss notice" : "Hinweis ausblenden"}
                className="mt-0.5 ml-auto shrink-0 rounded p-0.5 text-[color:var(--ds-warning-text)] hover:bg-[color:var(--ds-surface-2)] focus-visible:outline-2 focus-visible:outline-[color:var(--ds-ring)]"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          )}

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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-9 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
                  aria-label={lang === "en" ? "Clear search" : "Suche leeren"}
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

          {/* Mailbox read failed while the other channels loaded */}
          {!error && !loading && mailQuery.isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]"
            >
              <span>
                {lang === "en"
                  ? "E-mails could not be loaded — the list is incomplete."
                  : "E-Mails konnten nicht geladen werden — die Liste ist unvollständig."}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void mailQuery.refetch()}>
                <RefreshCw size={14} className="mr-2" />
                {tr("refresh", lang)}
              </Button>
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
          {!loading &&
            !error &&
            filtered.length === 0 &&
            (allMessages.length > 0 ? (
              <EmptyState
                icon={Search}
                title={tr("empty_title", lang)}
                description={tr("empty_filtered", lang)}
                actionLabel={lang === "en" ? "Reset filter" : "Filter zurücksetzen"}
                onAction={() => {
                  setSearch("");
                  setChannel("all");
                }}
              />
            ) : reviewCount > 0 ? (
              <EmptyState
                icon={InboxIcon}
                title={tr("empty_title", lang)}
                description={
                  lang === "en"
                    ? `${reviewCount} items are waiting for review.`
                    : `${reviewCount} ${reviewCount === 1 ? "Eintrag wartet" : "Einträge warten"} auf Ihre Prüfung.`
                }
                actionLabel={tr("empty_review_action", lang)}
                onAction={() => setView("review")}
              />
            ) : (
              <EmptyState
                icon={InboxIcon}
                title={tr("empty_title", lang)}
                description={tr("empty", lang)}
                actionLabel={tr("empty_connect_action", lang)}
                onAction={() => router.push("/dashboard/email-import")}
              />
            ))}

          {/* Urgency summary (rule-based classification, lib/triage) */}
          {!loading &&
            !error &&
            filtered.length > 0 &&
            triageSummary.critical + triageSummary.high > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-[color:var(--ds-text-muted)]" aria-hidden="true" />
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
                      "group flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,background-color,box-shadow] duration-[var(--ds-duration-normal)] hover:border-[color:var(--brand-primary)]/30 hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none",
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
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand-solid)]" />
                        )}
                        {card && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                              URGENCY_STYLES[card.urgency]
                            )}
                          >
                            {URGENCY_LABEL[card.urgency] ?? card.urgency}
                          </span>
                        )}
                        {card?.actionType && card.actionType !== "info" && (
                          <span className="shrink-0 rounded-full border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-primary)]/5 px-2 py-0.5 text-xs font-medium text-[color:var(--brand-primary)]">
                            {ACTION_LABEL[card.actionType] ?? card.actionType}
                          </span>
                        )}
                        {card?.deadline && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-[color:var(--ds-danger-text)]">
                            <AlertTriangle size={10} />
                            {deadlineLabel(card.deadline)}
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
                        {msg.channel === "portal" && msg.portalReplyable && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTarget(msg);
                              setReplyText("");
                            }}
                            className="inline-flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                          >
                            <Reply size={11} aria-hidden="true" />
                            {lang === "en" ? "Reply in portal" : "Im Portal antworten"}
                          </button>
                        )}
                      </div>
                      {/* Triage Actions */}
                      {card && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {card.deadline && !msg.slug.startsWith("mail:") && (
                            <button
                              type="button"
                              onClick={() =>
                                void triageActionMutation.mutateAsync({
                                  slug: msg.slug,
                                  action: "create_deadline",
                                  deadline_date: card.deadline,
                                  deadline_label: msg.title,
                                })
                              }
                              disabled={triageActionMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-xs whitespace-nowrap text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50 motion-reduce:transition-none"
                            >
                              <Clock size={12} aria-hidden="true" />
                              {tr("triage_deadline", lang)}
                            </button>
                          )}
                          {!msg.caseSlug && (
                            <button
                              type="button"
                              onClick={() => setAssignTarget(msg)}
                              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-xs whitespace-nowrap text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50 motion-reduce:transition-none"
                            >
                              <ArrowUpRight size={12} aria-hidden="true" />
                              {tr("triage_assign", lang)}
                            </button>
                          )}
                          {/* Triage status is kept on brain pages; a mailbox mail is
                              handled by assigning it to a matter (above). */}
                          {!msg.slug.startsWith("mail:") && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void triageActionMutation.mutateAsync({
                                    slug: msg.slug,
                                    action: "accept",
                                  })
                                }
                                disabled={triageActionMutation.isPending}
                                className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-xs whitespace-nowrap text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50 motion-reduce:transition-none"
                              >
                                <CheckCircle2 size={12} aria-hidden="true" />
                                {tr("triage_accept", lang)}
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={tr("more_actions", lang)}
                                    title={tr("more_actions", lang)}
                                    className="rounded-md p-1 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  <DropdownMenuItem
                                    disabled={triageActionMutation.isPending}
                                    onSelect={() =>
                                      void triageActionMutation.mutateAsync({
                                        slug: msg.slug,
                                        action: "reject",
                                      })
                                    }
                                  >
                                    <Ban size={13} className="mr-2" aria-hidden="true" />
                                    {tr("triage_reject", lang)}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={triageActionMutation.isPending}
                                    onSelect={() =>
                                      void triageActionMutation.mutateAsync({
                                        slug: msg.slug,
                                        action: "dismiss",
                                      })
                                    }
                                  >
                                    <X size={13} className="mr-2" aria-hidden="true" />
                                    {tr("triage_dismiss", lang)}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
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
                      className="shrink-0 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-[0.99] disabled:opacity-50 motion-reduce:transition-none"
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

      {/* Reply in the client portal */}
      <Dialog
        open={!!replyTarget}
        onOpenChange={(open) => !open && !replyBusy && setReplyTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {lang === "en" ? "Reply in the client portal" : "Im Mandantenportal antworten"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {replyTarget?.body && (
              <blockquote className="line-clamp-4 border-l-2 border-[color:var(--ds-border)] pl-3 text-xs text-[color:var(--ds-text-muted)]">
                {replyTarget.body}
              </blockquote>
            )}
            <div className="space-y-2">
              <Label htmlFor="portal-reply">{lang === "en" ? "Your reply" : "Ihre Antwort"}</Label>
              <Textarea
                id="portal-reply"
                rows={6}
                maxLength={5000}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                {lang === "en"
                  ? "The client sees this reply in the portal's message tab."
                  : "Die Mandantin oder der Mandant sieht die Antwort im Nachrichten-Tab des Portals."}
              </p>
            </div>
            {/* WP-3.16: Kontaktzeit als Leistung auf die Akte buchen. */}
            <label
              htmlFor="portal-reply-bill"
              className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--ds-text-muted)]"
            >
              <input
                id="portal-reply-bill"
                type="checkbox"
                checked={replyBill}
                onChange={(e) => setReplyBill(e.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-[var(--brand-primary)]"
              />
              {lang === "en" ? "Bill as billable service" : "Als Leistung auf die Akte buchen"}
            </label>
            {replyBill && (
              <div className="flex items-center gap-2 pl-6">
                <Input
                  id="portal-reply-minutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={600}
                  value={replyBillMinutes}
                  onChange={(e) => setReplyBillMinutes(e.target.value)}
                  className="w-24"
                  aria-label={lang === "en" ? "Minutes" : "Minuten"}
                />
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {lang === "en" ? "minutes" : "Minuten"}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyTarget(null)} disabled={replyBusy}>
              {lang === "en" ? "Cancel" : "Abbrechen"}
            </Button>
            <Button
              onClick={() => void sendPortalReply()}
              disabled={replyBusy || !replyText.trim()}
            >
              {replyBusy ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              {lang === "en" ? "Send" : "Senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign to Case Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === "en" ? "Assign to case" : "Akte zuweisen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{lang === "en" ? "Case" : "Akte"}</Label>
              <Select value={assignCase} onValueChange={setAssignCase}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === "en" ? "Select case" : "Akte wählen"} />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c: { slug: string; title: string }) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assignBusy}>
              {lang === "en" ? "Cancel" : "Abbrechen"}
            </Button>
            <Button
              onClick={() => assignTarget && void assignToCase(assignTarget, assignCase)}
              disabled={assignBusy || !assignCase}
            >
              {assignBusy ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              {lang === "en" ? "Assign" : "Zuweisen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
