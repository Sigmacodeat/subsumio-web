"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Inbox,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  XCircle,
  X,
  MoreVertical,
  RotateCcw,
  FileText,
  Mail,
  Phone,
  User,
  Building2,
  Landmark,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { sha256Hex } from "@/lib/gobd";
import { cn, encodeSlugPath } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import type { Lang } from "@/content/site";
import type { DashboardKey } from "@/content/dashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { triageBatch, type TriageInput } from "@/lib/triage";
import { Zap, AlertTriangle, Calendar, Euro, Info, ShieldAlert } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { tracking } from "@/lib/tracking";
import { IntakeAcceptanceWizard } from "@/components/legal/IntakeAcceptanceWizard";
import type { IntakeAcceptanceWorkflow } from "@/lib/intake-acceptance";

type IntakeStatus = "new" | "needs_info" | "conflict_check" | "accepted" | "rejected" | "converted";

type IntakeSource = "whatsapp" | "portal" | "web" | "email" | "bea" | "scan" | "manual";

interface IntakeRecord {
  slug: string;
  title: string;
  content?: string;
  frontmatter: {
    type: "intake_request";
    source: IntakeSource;
    status: IntakeStatus;
    client_name?: string;
    phone_hash?: string;
    email?: string;
    legal_area?: string;
    summary: string;
    missing_documents?: string[];
    conflict_check_status?: "pending" | "clear" | "conflict" | "needs_review";
    converted_case_slug?: string;
    source_event_slug?: string;
    created_at: string;
    updated_at: string;
    /** Mandatsannahme-Pipeline — Status aller Pflichtschritte. */
    acceptance?: IntakeAcceptanceWorkflow;
  };
}

const STATUS_FILTERS: Array<{ key: "all" | IntakeStatus; labelKey: DashboardKey }> = [
  { key: "all", labelKey: "intake.filter_all" },
  { key: "new", labelKey: "intake.filter_new" },
  { key: "needs_info", labelKey: "intake.filter_needs_info" },
  { key: "conflict_check", labelKey: "intake.filter_conflict_check" },
  { key: "accepted", labelKey: "intake.filter_accepted" },
  { key: "rejected", labelKey: "intake.filter_rejected" },
  { key: "converted", labelKey: "intake.filter_converted" },
];

const STATUS_BADGE: Record<IntakeStatus, string> = {
  new: "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  needs_info: "border-slate-500/20 bg-slate-500/10 text-slate-600",
  conflict_check: "border-violet-500/20 bg-violet-500/10 text-violet-600",
  accepted:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  rejected:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  converted:
    "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
};

const SOURCE_ICON: Record<IntakeSource, React.ElementType> = {
  whatsapp: MessageSquareText,
  portal: User,
  web: Search,
  email: Mail,
  bea: Landmark,
  scan: FileText,
  manual: FileText,
};

function listFromResponse(data: unknown): IntakeRecord[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as { intakes?: unknown }).intakes;
  if (!Array.isArray(items)) return [];
  return items as IntakeRecord[];
}

function createdLabel(lang: Lang, value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(lang === "en" ? "en-GB" : "de-DE");
}

export default function IntakePage() {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | IntakeStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | IntakeSource>("all");
  const [search, setSearch] = useState("");
  const [conversionTargets, setConversionTargets] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardItem, setWizardItem] = useState<IntakeRecord | null>(null);
  const [updatingSlug, setUpdatingSlug] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    source: "manual" as IntakeSource,
    summary: "",
    client_name: "",
    email: "",
    phone_hash: "",
    legal_area: "",
    missing_documents: "",
  });

  const listQuery = useQuery({
    queryKey: ["intake", "list"],
    queryFn: () => api.intake.list({ limit: 200 }),
  });

  const updateMutation = useMutation({
    mutationFn: api.intake.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake", "list"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: api.intake.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake", "list"] });
      setCreateForm({
        source: "manual",
        summary: "",
        client_name: "",
        email: "",
        phone_hash: "",
        legal_area: "",
        missing_documents: "",
      });
      setCreateOpen(false);
      addToast({ type: "success", title: t("intake.toast_created") });
    },
    onError: (err) => {
      addToast({
        type: "error",
        title: t("intake.toast_create_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  function handleConverted() {
    tracking.intake.approved("converted");
    qc.invalidateQueries({ queryKey: ["intake", "list"] });
    qc.invalidateQueries({ queryKey: ["brain", "pages"] });
    addToast({ type: "success", title: t("intake.toast_converted") });
    setWizardItem(null);
  }

  const items = useMemo(() => listFromResponse(listQuery.data), [listQuery.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.frontmatter.status !== filter) return false;
      if (sourceFilter !== "all" && item.frontmatter.source !== sourceFilter) return false;
      if (!q) return true;
      const haystack = [
        item.title,
        item.frontmatter.summary,
        item.frontmatter.client_name,
        item.frontmatter.email,
        item.frontmatter.legal_area,
        item.frontmatter.source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, filter, search, sourceFilter]);

  const metrics = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.frontmatter.status] = (acc[item.frontmatter.status] || 0) + 1;
      if (
        item.frontmatter.status !== "converted" &&
        item.frontmatter.status !== "rejected" &&
        (!item.frontmatter.client_name ||
          !item.frontmatter.legal_area ||
          (item.frontmatter.missing_documents?.length ?? 0) > 0)
      ) {
        acc.incomplete = (acc.incomplete || 0) + 1;
      }
      if (
        item.frontmatter.status === "conflict_check" ||
        item.frontmatter.conflict_check_status === "pending" ||
        item.frontmatter.conflict_check_status === "needs_review" ||
        item.frontmatter.conflict_check_status === "conflict"
      ) {
        acc.conflict = (acc.conflict || 0) + 1;
      }
      const created = new Date(item.frontmatter.created_at).getTime();
      if (
        !Number.isNaN(created) &&
        Date.now() - created > 24 * 60 * 60 * 1000 &&
        item.frontmatter.status !== "converted" &&
        item.frontmatter.status !== "rejected"
      ) {
        acc.stale = (acc.stale || 0) + 1;
      }
      return acc;
    }, {});
  }, [items]);

  async function updateStatus(item: IntakeRecord, status: IntakeStatus) {
    setUpdatingSlug(item.slug);
    try {
      await updateMutation.mutateAsync({ slug: item.slug, status });
      addToast({ type: "success", title: t("intake.toast_status_changed") });
    } catch (err) {
      addToast({
        type: "error",
        title: t("intake.toast_update_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUpdatingSlug(null);
    }
  }

  function startAcceptance(item: IntakeRecord) {
    if (item.frontmatter.status === "converted" || item.frontmatter.status === "rejected") {
      return;
    }
    setWizardItem(item);
  }

  async function createIntake() {
    const summary = createForm.summary.trim();
    if (!summary) return;
    const missingDocuments = createForm.missing_documents
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    await createMutation.mutateAsync({
      source: createForm.source,
      summary,
      client_name: createForm.client_name.trim() || undefined,
      email: createForm.email.trim() || undefined,
      phone_hash: createForm.phone_hash.trim()
        ? await sha256Hex(createForm.phone_hash.trim())
        : undefined,
      legal_area: createForm.legal_area.trim() || undefined,
      missing_documents: missingDocuments.length ? missingDocuments : undefined,
    });
  }

  function canStartAcceptance(item: IntakeRecord) {
    return item.frontmatter.status !== "converted" && item.frontmatter.status !== "rejected";
  }

  const loading = listQuery.isLoading;
  const loadError = listQuery.isError ? t("intake.err_load") : null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("intake.title")}
        description={t("intake.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("intake.title") },
        ]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void qc.invalidateQueries({ queryKey: ["intake", "list"] })}
              className="gap-2 text-xs"
            >
              <RefreshCw size={14} />
              {t("intake.btn_refresh")}
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="brand-bg gap-2 text-white">
              <Plus size={16} />
              {t("intake.btn_new")}
            </Button>
          </div>
        }
      />

      {/* Info banner */}
      <div
        className="brand-border brand-soft/5 flex items-start gap-3 rounded-xl border px-4 py-3"
        role="note"
      >
        <AlertCircle size={16} className="brand-text mt-0.5 shrink-0" aria-hidden="true" />
        <p className="brand-text/90 text-xs leading-relaxed">{t("intake.info_banner")}</p>
      </div>

      {/* KI-Triage Panel */}
      {!loading && items.length > 0 && <TriagePanel items={items} />}

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label={t("intake.stats_new")} value={metrics.new || 0} tone="amber" />
          <StatCard
            label={t("intake.stats_incomplete")}
            value={metrics.incomplete || 0}
            tone="slate"
          />
          <StatCard
            label={t("intake.stats_conflict")}
            value={metrics.conflict || 0}
            tone="violet"
          />
          <StatCard label={t("intake.stats_sla")} value={metrics.stale || 0} tone="red" />
          <StatCard
            label={t("intake.stats_accepted")}
            value={metrics.accepted || 0}
            tone="emerald"
          />
          <StatCard
            label={t("intake.stats_converted")}
            value={metrics.converted || 0}
            tone="blue"
          />
        </div>
      )}

      {/* Channel Tabs (Kanal-Tabs) */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--ds-border)]">
          {(
            [
              { key: "all", icon: Inbox, label: t("intake.source_all") },
              { key: "whatsapp", icon: MessageSquareText, label: "WhatsApp" },
              { key: "email", icon: Mail, label: "E-Mail" },
              { key: "bea", icon: Landmark, label: "beA", href: "/dashboard/bea" },
              { key: "scan", icon: FileText, label: t("intake.source_scan") },
              { key: "portal", icon: User, label: "Portal" },
              { key: "web", icon: Search, label: "Web" },
              { key: "manual", icon: FileText, label: t("intake.source_manual") },
            ] as const
          ).map((tab) => {
            const count =
              tab.key === "all"
                ? items.length
                : "href" in tab && tab.href
                  ? 0
                  : items.filter((i) => i.frontmatter.source === tab.key).length;
            const isActive = sourceFilter === (tab.key as string);
            const className = cn(
              "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "border-[color:var(--brand-primary)] font-medium text-[color:var(--ds-text)]"
                : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            );
            const inner = (
              <>
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
              </>
            );
            if ("href" in tab && tab.href) {
              // Not a filter — jumps to the dedicated page. The arrow marks it
              // as an outbound link so it doesn't masquerade as a tab.
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={className}
                  title={`${tab.label} — ${t("intake.opens_page")}`}
                >
                  {inner}
                  <ArrowUpRight size={12} className="text-[color:var(--ds-text-subtle)]" />
                </Link>
              );
            }
            return (
              <button
                key={tab.key}
                onClick={() =>
                  setSourceFilter(isActive ? "all" : (tab.key as "all" | IntakeSource))
                }
                className={className}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter + Search */}
      {!loading && items.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((entry) => {
                const count = entry.key === "all" ? items.length : metrics[entry.key] || 0;
                return (
                  <FilterChip
                    key={entry.key}
                    label={`${t(entry.labelKey)} (${count})`}
                    active={filter === entry.key}
                    onClick={() => setFilter(filter === entry.key ? "all" : entry.key)}
                  />
                );
              })}
            </div>
            <div className="relative xl:w-72">
              <Search
                size={15}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("intake.search_placeholder")}
                aria-label={t("intake.search_placeholder")}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-9 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
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
          </div>
        </div>
      )}

      {/* Error with retry */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void listQuery.refetch()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} />
            {t("intake.btn_retry")}
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-3 w-48 rounded" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox size={26} className="text-[color:var(--ds-text-subtle)]" />}
          title={t("intake.empty_fresh_title")}
          hint={t("intake.empty_fresh_hint")}
          cta={
            <Button onClick={() => setCreateOpen(true)} className="brand-bg gap-2 text-white">
              <Plus size={16} />
              {t("intake.empty_cta")}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={26} className="text-[color:var(--ds-text-subtle)]" />}
          title={t("intake.empty_title")}
          hint={t("intake.empty_hint")}
        />
      ) : (
        <>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            {t("intake.result_count").replace("{{count}}", String(filtered.length))}
          </p>
          <div className="space-y-3">
            {filtered.map((item) => {
              const SourceIcon = SOURCE_ICON[item.frontmatter.source] || FileText;
              return (
                <div
                  key={item.slug}
                  className="group space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[color:var(--ds-border-strong)] hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
                        <SourceIcon size={15} className="text-[color:var(--ds-text-muted)]" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="default"
                            className="brand-soft brand-border brand-text border text-xs"
                          >
                            {item.frontmatter.source}
                          </Badge>
                          <Badge
                            variant="default"
                            className={cn("border text-xs", STATUS_BADGE[item.frontmatter.status])}
                          >
                            {item.frontmatter.status}
                          </Badge>
                          {item.frontmatter.conflict_check_status && (
                            <Badge
                              variant="default"
                              className="border border-slate-500/20 bg-slate-500/10 text-xs text-slate-600"
                            >
                              {item.frontmatter.conflict_check_status}
                            </Badge>
                          )}
                        </div>
                        <h3 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
                          {item.frontmatter.client_name || item.title}
                        </h3>
                        <p className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                          {item.frontmatter.summary}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      <div className="text-right text-xs text-[color:var(--ds-text-muted)]">
                        <div className="flex items-center justify-end gap-1">
                          <Clock size={12} />
                          {createdLabel(lang, item.frontmatter.created_at)}
                        </div>
                        <div className="mt-1 font-mono">{item.slug}</div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-150 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                            aria-label={t("intake.aria_menu")}
                          >
                            <MoreVertical size={15} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => void updateStatus(item, "needs_info")}
                            disabled={updatingSlug === item.slug}
                            className="gap-2 text-xs"
                          >
                            <AlertCircle size={13} />
                            {t("intake.action_info")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void updateStatus(item, "conflict_check")}
                            disabled={updatingSlug === item.slug}
                            className="gap-2 text-xs"
                          >
                            <Clock size={13} />
                            {t("intake.action_conflict")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void updateStatus(item, "accepted")}
                            disabled={updatingSlug === item.slug}
                            className="gap-2 text-xs"
                          >
                            <CheckCircle2 size={13} />
                            {t("intake.action_accept")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => void updateStatus(item, "rejected")}
                            disabled={updatingSlug === item.slug}
                            className="gap-2 text-xs text-[color:var(--ds-danger-text)] focus:text-[color:var(--ds-danger-text)]"
                          >
                            <XCircle size={13} />
                            {t("intake.action_reject")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                    <div className="space-y-2 text-xs text-[color:var(--ds-text-muted)]">
                      <div className="flex flex-wrap gap-2">
                        {item.frontmatter.legal_area && (
                          <span className="flex items-center gap-1">
                            <Building2 size={11} />
                            {t("intake.label_area")}: {item.frontmatter.legal_area}
                          </span>
                        )}
                        {item.frontmatter.email && (
                          <span className="flex items-center gap-1">
                            <Mail size={11} />
                            {item.frontmatter.email}
                          </span>
                        )}
                        {item.frontmatter.phone_hash && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} />
                            {item.frontmatter.phone_hash.slice(0, 10)}…
                          </span>
                        )}
                      </div>
                      {item.frontmatter.missing_documents?.length ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{t("intake.label_missing")}:</span>
                          {item.frontmatter.missing_documents.map((doc) => (
                            <Badge
                              key={doc}
                              variant="default"
                              className="border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-xs text-[color:var(--ds-warning-text)]"
                            >
                              {doc}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {item.frontmatter.source_event_slug && (
                        <a
                          href={`/dashboard/brain/${encodeURIComponent(item.frontmatter.source_event_slug)}`}
                          className="inline-flex items-center gap-1 font-mono text-[color:var(--ds-text)] hover:underline"
                        >
                          <MessageSquareText size={12} />
                          {t("intake.source_event")}: {item.frontmatter.source_event_slug}
                        </a>
                      )}
                      {item.frontmatter.phone_hash && (
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(item.frontmatter.phone_hash || "");
                            addToast({ type: "info", title: t("intake.toast_copy_hash") });
                          }}
                          className="inline-flex items-center gap-1 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
                        >
                          <Copy size={12} />
                          {t("intake.copy_hash")}
                        </button>
                      )}
                      {item.frontmatter.converted_case_slug && (
                        <a
                          href={`/dashboard/cases/${encodeSlugPath(item.frontmatter.converted_case_slug)}`}
                          className="inline-flex items-center gap-1 font-mono text-[color:var(--ds-success-text)] hover:underline"
                        >
                          <ChevronRight size={12} />
                          {t("intake.converted_case")}: {item.frontmatter.converted_case_slug}
                        </a>
                      )}
                    </div>

                    <div className="flex min-w-[280px] flex-col gap-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.frontmatter.status !== "converted" &&
                          item.frontmatter.status !== "rejected" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void updateStatus(item, "needs_info")}
                                disabled={updatingSlug === item.slug}
                                className="gap-1.5 text-xs"
                              >
                                <AlertCircle size={13} />
                                {t("intake.action_info")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void updateMutation
                                    .mutateAsync({
                                      slug: item.slug,
                                      status: "conflict_check",
                                      conflict_check_status: "pending",
                                    })
                                    .then(() =>
                                      addToast({
                                        type: "success",
                                        title: t("intake.toast_status_changed"),
                                      })
                                    )
                                    .catch((err) =>
                                      addToast({
                                        type: "error",
                                        title: t("intake.toast_update_failed"),
                                        description: err instanceof Error ? err.message : undefined,
                                      })
                                    )
                                }
                                disabled={updatingSlug === item.slug}
                                className="gap-1.5 text-xs"
                              >
                                <Clock size={13} />
                                {t("intake.action_conflict")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void updateMutation
                                    .mutateAsync({
                                      slug: item.slug,
                                      status: "accepted",
                                      conflict_check_status: "clear",
                                    })
                                    .then(() =>
                                      addToast({
                                        type: "success",
                                        title: t("intake.toast_status_changed"),
                                      })
                                    )
                                    .catch((err) =>
                                      addToast({
                                        type: "error",
                                        title: t("intake.toast_update_failed"),
                                        description: err instanceof Error ? err.message : undefined,
                                      })
                                    )
                                }
                                disabled={updatingSlug === item.slug}
                                className="gap-1.5 text-xs text-[color:var(--ds-success-text)] hover:text-[color:var(--ds-success-text)]"
                              >
                                <CheckCircle2 size={13} />
                                {t("intake.action_accept")}
                              </Button>
                            </>
                          )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={
                            conversionTargets[item.slug] ??
                            item.frontmatter.converted_case_slug ??
                            ""
                          }
                          onChange={(e) =>
                            setConversionTargets((prev) => ({
                              ...prev,
                              [item.slug]: e.target.value,
                            }))
                          }
                          placeholder={t("intake.convert_placeholder")}
                          className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--brand-primary)]"
                        />
                        <Button
                          onClick={() => startAcceptance(item)}
                          disabled={!canStartAcceptance(item)}
                          className="brand-bg gap-2 text-white"
                          title={
                            !canStartAcceptance(item)
                              ? t("intake.convert_disabled_hint")
                              : undefined
                          }
                        >
                          <Plus size={14} />
                          {t("intake.action_acceptance")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Mandatsannahme Wizard */}
      {wizardItem && (
        <IntakeAcceptanceWizard
          open={Boolean(wizardItem)}
          onOpenChange={(open) => {
            if (!open) setWizardItem(null);
          }}
          item={wizardItem}
          caseSlug={conversionTargets[wizardItem.slug]?.trim()}
          onUpdated={() => void qc.invalidateQueries({ queryKey: ["intake", "list"] })}
          onConverted={handleConverted}
        />
      )}

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("intake.modal_create_title")}</DialogTitle>
            <DialogDescription>{t("intake.modal_create_desc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("intake.label_source")}
              </label>
              <select
                value={createForm.source}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    source: e.target.value as IntakeSource,
                  }))
                }
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              >
                <option value="manual">{t("intake.source_manual")}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-Mail</option>
                <option value="bea">beA</option>
                <option value="scan">{t("intake.source_scan")}</option>
                <option value="portal">Portal</option>
                <option value="web">Web</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("intake.label_summary")} *
              </label>
              <textarea
                value={createForm.summary}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, summary: e.target.value }))}
                placeholder={t("intake.placeholder_summary")}
                rows={3}
                autoFocus
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("intake.label_client")}
                </label>
                <Input
                  value={createForm.client_name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, client_name: e.target.value }))
                  }
                  placeholder={t("intake.placeholder_client")}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("intake.label_legal_area")}
                </label>
                <Input
                  value={createForm.legal_area}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, legal_area: e.target.value }))
                  }
                  placeholder={t("intake.placeholder_legal_area")}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("intake.label_email")}
                </label>
                <Input
                  value={createForm.email}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder={t("intake.placeholder_email")}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("intake.label_phone")}
                </label>
                <Input
                  value={createForm.phone_hash}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, phone_hash: e.target.value }))
                  }
                  placeholder={t("intake.placeholder_phone")}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("intake.label_missing_documents")}
              </label>
              <Input
                value={createForm.missing_documents}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, missing_documents: e.target.value }))
                }
                placeholder={t("intake.placeholder_missing_documents")}
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              className="text-[color:var(--ds-text-muted)]"
            >
              {t("intake.modal_btn_cancel")}
            </Button>
            <Button
              type="button"
              disabled={createMutation.isPending || !createForm.summary.trim()}
              onClick={() => void createIntake()}
              className="brand-bg gap-2 text-white"
            >
              {createMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {createMutation.isPending
                ? t("intake.modal_btn_creating")
                : t("intake.modal_btn_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "blue" | "slate" | "red" | "violet";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-[color:var(--ds-success-text)]"
      : tone === "amber"
        ? "text-[color:var(--ds-warning-text)]"
        : tone === "blue"
          ? "text-[color:var(--ds-info-text)]"
          : tone === "red"
            ? "text-[color:var(--ds-danger-text)]"
            : tone === "violet"
              ? "text-violet-600"
              : "text-[color:var(--ds-text)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className={cn("text-lg font-bold tabular-nums", toneClass)}>{value}</div>
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
        {icon}
      </div>
      <h3 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
        {hint}
      </p>
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}

const URGENCY_STYLES: Record<string, string> = {
  critical:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  high: "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  medium:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  low: "border-slate-500/20 bg-slate-500/10 text-slate-600",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  frist: AlertTriangle,
  termin: Calendar,
  antwort: Mail,
  dokument: FileText,
  zahlung: Euro,
  info: Info,
  konflikt: ShieldAlert,
};

function TriagePanel({ items }: { items: IntakeRecord[] }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(true);

  const triageCards = useMemo(() => {
    const inputs: TriageInput[] = items
      .filter((item) => item.frontmatter.status === "new")
      .map((item) => ({
        source: (item.frontmatter.source === "web"
          ? "portal"
          : item.frontmatter.source) as TriageInput["source"],
        subject: item.title,
        body: item.frontmatter.summary,
        sender: item.frontmatter.email,
        date: item.frontmatter.created_at,
        rawSlug: item.slug,
      }));
    return triageBatch(inputs).sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.urgency] - order[b.urgency];
    });
  }, [items]);

  if (triageCards.length === 0) return null;

  const criticalCount = triageCards.filter((c) => c.urgency === "critical").length;
  const highCount = triageCards.filter((c) => c.urgency === "high").length;

  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Zap size={16} className="brand-text" />
          <span className="text-sm font-semibold text-[color:var(--ds-text)]">KI-Triage</span>
          {criticalCount > 0 && (
            <Badge
              variant="default"
              className="border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
            >
              {criticalCount} kritisch
            </Badge>
          )}
          {highCount > 0 && (
            <Badge
              variant="default"
              className="border border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-xs text-[color:var(--ds-attention-text)]"
            >
              {highCount} hoch
            </Badge>
          )}
        </div>
        <ChevronRight
          size={16}
          className={cn(
            "text-[color:var(--ds-text-muted)] transition-transform",
            expanded && "rotate-90"
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-[color:var(--ds-border)] px-4 py-3">
          {triageCards.slice(0, 10).map((card) => {
            const ActionIcon = ACTION_ICONS[card.actionType] || Info;
            return (
              <div
                key={card.id}
                className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)]">
                  <ActionIcon size={14} className="text-[color:var(--ds-text-muted)]" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="default"
                      className={cn("border text-xs", URGENCY_STYLES[card.urgency])}
                    >
                      {card.urgency}
                    </Badge>
                    <Badge
                      variant="default"
                      className="brand-soft brand-border brand-text border text-xs"
                    >
                      {card.actionType}
                    </Badge>
                    {card.legalArea && (
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        {card.legalArea}
                      </span>
                    )}
                    {card.deadline && (
                      <span className="flex items-center gap-1 text-xs text-[color:var(--ds-danger-text)]">
                        <AlertTriangle size={10} />
                        Frist: {card.deadline}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {card.title}
                  </p>
                  <p className="line-clamp-1 text-xs text-[color:var(--ds-text-muted)]">
                    {card.summary}
                  </p>
                </div>
                {card.rawSlug && (
                  <Link
                    href={`/dashboard/brain/${encodeURIComponent(card.rawSlug)}`}
                    className="shrink-0 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    title={t("intake.aria_details")}
                  >
                    <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            );
          })}
          {triageCards.length > 10 && (
            <p className="pt-1 text-center text-xs text-[color:var(--ds-text-muted)]">
              +{triageCards.length - 10} weitere
            </p>
          )}
        </div>
      )}
    </div>
  );
}
