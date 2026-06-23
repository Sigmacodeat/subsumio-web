"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
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
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type IntakeStatus = "new" | "needs_info" | "conflict_check" | "accepted" | "rejected" | "converted";

type IntakeSource = "whatsapp" | "portal" | "web" | "email" | "manual";

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
  new: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  needs_info: "border-slate-500/20 bg-slate-500/10 text-slate-600",
  conflict_check: "border-violet-500/20 bg-violet-500/10 text-violet-600",
  accepted: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  rejected: "border-red-500/20 bg-red-500/10 text-red-600",
  converted: "border-blue-500/20 bg-blue-500/10 text-blue-600",
};

const SOURCE_ICON: Record<IntakeSource, React.ElementType> = {
  whatsapp: MessageSquareText,
  portal: User,
  web: Search,
  email: Mail,
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

  const convertMutation = useMutation({
    mutationFn: api.intake.convert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake", "list"] });
      qc.invalidateQueries({ queryKey: ["brain", "pages"] });
      addToast({ type: "success", title: t("intake.toast_converted") });
    },
    onError: (err) => {
      addToast({
        type: "error",
        title: t("intake.toast_convert_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

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
    try {
      await updateMutation.mutateAsync({ slug: item.slug, status });
      addToast({ type: "success", title: t("intake.toast_status_changed") });
    } catch (err) {
      addToast({
        type: "error",
        title: t("intake.toast_update_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function convertToCase(item: IntakeRecord) {
    if (!canConvert(item)) {
      addToast({
        type: "error",
        title: t("intake.toast_convert_blocked"),
        description: t("intake.toast_convert_blocked_desc"),
      });
      return;
    }
    const desiredSlug = conversionTargets[item.slug]?.trim();
    await convertMutation.mutateAsync({
      slug: item.slug,
      case_slug: desiredSlug || undefined,
      title: item.frontmatter.client_name
        ? `${item.frontmatter.client_name}${item.frontmatter.legal_area ? ` - ${item.frontmatter.legal_area}` : ""}`
        : undefined,
      priority: "medium",
      portal_enabled: false,
    });
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
      phone_hash: createForm.phone_hash.trim() || undefined,
      legal_area: createForm.legal_area.trim() || undefined,
      missing_documents: missingDocuments.length ? missingDocuments : undefined,
    });
  }

  function canConvert(item: IntakeRecord) {
    if (item.frontmatter.status === "converted" || item.frontmatter.status === "rejected")
      return false;
    if (item.frontmatter.status !== "accepted") return false;
    return (
      item.frontmatter.conflict_check_status !== "pending" &&
      item.frontmatter.conflict_check_status !== "needs_review" &&
      item.frontmatter.conflict_check_status !== "conflict"
    );
  }

  const loading = listQuery.isLoading;
  const loadError = listQuery.isError ? t("intake.err_load") : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("intake.title")}
        description={t("intake.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("intake.title") }]}
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

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "whatsapp", "email", "portal", "web", "manual"] as const).map((source) => (
              <FilterChip
                key={source}
                label={source === "all" ? t("intake.source_all") : source}
                active={sourceFilter === source}
                onClick={() => setSourceFilter(sourceFilter === source ? "all" : source)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error with retry */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void listQuery.refetch()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
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
                            className="gap-2 text-xs"
                          >
                            <AlertCircle size={13} />
                            {t("intake.action_info")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void updateStatus(item, "conflict_check")}
                            className="gap-2 text-xs"
                          >
                            <Clock size={13} />
                            {t("intake.action_conflict")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void updateStatus(item, "accepted")}
                            className="gap-2 text-xs"
                          >
                            <CheckCircle2 size={13} />
                            {t("intake.action_accept")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => void updateStatus(item, "rejected")}
                            className="gap-2 text-xs text-red-600 focus:text-red-700"
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
                              className="border border-amber-500/20 bg-amber-500/10 text-xs text-amber-700"
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
                          className="inline-flex items-center gap-1 font-mono text-emerald-600 hover:underline"
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
                                className="gap-1.5 text-xs text-emerald-600 hover:text-emerald-700"
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
                          onClick={() => void convertToCase(item)}
                          disabled={convertMutation.isPending || !canConvert(item)}
                          className="brand-bg gap-2 text-white"
                          title={!canConvert(item) ? t("intake.convert_disabled_hint") : undefined}
                        >
                          {convertMutation.isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Plus size={14} />
                          )}
                          {t("intake.action_convert")}
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              >
                <option value="manual">{t("intake.source_manual")}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-Mail</option>
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
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "blue"
          ? "text-blue-600"
          : tone === "red"
            ? "text-red-600"
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
