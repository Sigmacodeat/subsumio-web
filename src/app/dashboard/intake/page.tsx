"use client";

import { useEffect, useMemo, useState } from "react";
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
  User,
  Building2,
  Landmark,
  BookOpen,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DemoIngestCard } from "@/components/dashboard/demo-ingest-card";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { sha256Hex } from "@/lib/gobd";
import { cn, encodeSlugPath, formatDate, formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  needs_info:
    "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
  conflict_check:
    "border-[color:var(--ds-category-violet-border)] bg-[color:var(--ds-category-violet-bg)] text-[color:var(--ds-category-violet-text)]",
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
  if (lang === "en") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB");
  }
  return formatDateTime(value);
}

const SOURCE_LABEL: Record<IntakeSource, string> = {
  whatsapp: "WhatsApp",
  portal: "Portal",
  web: "Website",
  email: "E-Mail",
  bea: "ERV",
  scan: "Scan",
  manual: "Manuell",
};

const CONFLICT_STATUS_LABEL: Record<string, string> = {
  pending: "Kollision offen",
  clear: "Keine Kollision",
  conflict: "Kollision",
  needs_review: "Kollision prüfen",
};

const CONFLICT_STATUS_TONE: Record<string, string> = {
  pending:
    "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
  clear:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  conflict:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  needs_review:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
};

/**
 * German wording for i18n keys whose dashboard.ts German text is still
 * English/technical ("Conflict Check", "Phone Hash", …). Remove once the
 * keys are fixed in src/content/dashboard.ts.
 */
const DE_OVERRIDE: Partial<Record<DashboardKey, string>> = {
  "intake.filter_conflict_check": "Kollisionsprüfung",
  "intake.action_conflict": "Zur Kollisionsprüfung",
  "intake.filter_converted": "In Akte überführt",
  "intake.filter_needs_info": "Rückfrage",
  "intake.copy_hash": "WhatsApp-Kennung kopieren",
  "intake.toast_copy_hash": "WhatsApp-Kennung kopiert",
  "intake.label_phone": "Telefon / WhatsApp-Nummer",
  "intake.placeholder_phone": "+43 …",
};

const STATUS_LABEL_KEY: Record<IntakeStatus, DashboardKey> = {
  new: "intake.filter_new",
  needs_info: "intake.filter_needs_info",
  conflict_check: "intake.filter_conflict_check",
  accepted: "intake.filter_accepted",
  rejected: "intake.filter_rejected",
  converted: "intake.filter_converted",
};

export default function IntakePage() {
  const { t: tBase, lang } = useLang();
  const t = (key: DashboardKey): string =>
    lang !== "en" && DE_OVERRIDE[key] ? (DE_OVERRIDE[key] as string) : tBase(key);
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | IntakeStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | IntakeSource>("all");
  const [search, setSearch] = useState("");
  const [searchParams] = useState(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
  );

  const [wizardItem, setWizardItem] = useState<IntakeRecord | null>(null);
  const [updatingSlug, setUpdatingSlug] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [conversionTargets, setConversionTargets] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState({
    source: "manual" as IntakeSource,
    summary: "",
    client_name: "",
    email: "",
    phone_hash: "",
    legal_area: "",
    missing_documents: "",
  });

  useEffect(() => {
    const isNew = searchParams.get("new") === "1";
    const name = searchParams.get("name");
    if (isNew) {
      setCreateOpen(true);
      if (name) {
        setCreateForm((prev) => ({ ...prev, client_name: name }));
      }
    }
  }, [searchParams]);

  const listQuery = useQuery({
    queryKey: ["intake", "list"],
    queryFn: () => api.intake.list({ limit: 200 }),
  });

  // Existing Akten for the optional "attach to existing case" choice.
  const casesQuery = useQuery({
    queryKey: ["intake", "cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
    staleTime: 60_000,
  });
  const caseOptions = (Array.isArray(casesQuery.data) ? casesQuery.data : []) as Array<{
    slug: string;
    title: string;
  }>;

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
    onError: () => {
      addToast({
        type: "error",
        title: t("intake.toast_create_failed"),
        description: "Bitte versuchen Sie es erneut.",
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
    } catch {
      addToast({
        type: "error",
        title: t("intake.toast_update_failed"),
        description: "Bitte versuchen Sie es erneut.",
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
    const result = await createMutation.mutateAsync({
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
    // AP11: Neugestalteter Intake leitet direkt in den Mandatsannahme-Wizard
    if (result && typeof result === "object" && "slug" in result) {
      setWizardItem(result as unknown as IntakeRecord);
    }
  }

  function canStartAcceptance(item: IntakeRecord) {
    return item.frontmatter.status !== "converted" && item.frontmatter.status !== "rejected";
  }

  const presentSources = useMemo(
    () =>
      [...new Set(items.map((i) => i.frontmatter.source))].filter(
        (src): src is IntakeSource => src in SOURCE_LABEL
      ),
    [items]
  );

  const loading = listQuery.isLoading;
  const loadError = listQuery.isError ? t("intake.err_load") : null;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("intake.title")}
        description={t("intake.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("intake.title") },
        ]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button variant="outline" size="sm" asChild className="gap-2 text-xs">
              <Link href="/dashboard/posteingangsbuch" title={t("intake.link_register_hint")}>
                <BookOpen size={14} aria-hidden />
                {t("intake.link_register")}
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void qc.invalidateQueries({ queryKey: ["intake", "list"] })}
              className="gap-2 text-xs"
            >
              <RefreshCw size={14} />
              {t("intake.btn_refresh")}
            </Button>
            <PrimaryAction onClick={() => setCreateOpen(true)}>{t("intake.btn_new")}</PrimaryAction>
          </div>
        }
      />

      {/* Public live-demo: staged incoming brief (chapter 2 of the tour) */}
      <DemoIngestCard />

      {/* Urgency hints (rule-based, lib/triage) — only when something is urgent */}
      {!loading && items.length > 0 && <TriagePanel items={items} />}

      {/* Stats bar — open work only; accepted/converted are covered by the status filter */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("intake.stats_new")} value={metrics.new || 0} />
          <StatCard label={t("intake.stats_incomplete")} value={metrics.incomplete || 0} />
          <StatCard
            label={t("intake.stats_conflict")}
            value={metrics.conflict || 0}
            tone="warning"
          />
          <StatCard label="Länger als 24 Std. offen" value={metrics.stale || 0} tone="danger" />
        </div>
      )}

      {/* Channel tabs — only sources that actually occur, and only when there is a choice */}
      {!loading && presentSources.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--ds-border)]">
          {(["all", ...presentSources] as Array<"all" | IntakeSource>).map((key) => {
            const Icon = key === "all" ? Inbox : SOURCE_ICON[key] || FileText;
            const label = key === "all" ? t("intake.source_all") : SOURCE_LABEL[key];
            const count =
              key === "all"
                ? items.length
                : items.filter((i) => i.frontmatter.source === key).length;
            const isActive = sourceFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSourceFilter(isActive ? "all" : key)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-[color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                  isActive
                    ? "border-[color:var(--brand-primary)] font-medium text-[color:var(--ds-text)]"
                    : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
                <span className="rounded-full bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                  {count}
                </span>
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
                    label={count > 0 ? `${t(entry.labelKey)} (${count})` : t(entry.labelKey)}
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-9 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-0.5 text-[color:var(--ds-text-muted)] transition-[color,transform] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
                  aria-label="Suche leeren"
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
          icon={Inbox}
          title={t("intake.empty_fresh_title")}
          description={t("intake.empty_fresh_hint")}
          actionLabel={t("intake.empty_cta")}
          onAction={() => setCreateOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("intake.empty_title")}
          description={t("intake.empty_hint")}
          actionLabel="Filter zurücksetzen"
          onAction={() => {
            setFilter("all");
            setSourceFilter("all");
            setSearch("");
          }}
        />
      ) : (
        <>
          {filtered.length !== items.length && (
            <p className="text-xs text-[color:var(--ds-text-subtle)]">
              {t("intake.result_count").replace("{{count}}", String(filtered.length))}
            </p>
          )}
          <div className="space-y-3">
            {filtered.map((item) => {
              const SourceIcon = SOURCE_ICON[item.frontmatter.source] || FileText;
              return (
                <div
                  key={item.slug}
                  className="group space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,box-shadow] duration-[var(--ds-duration-normal)] hover:border-[color:var(--ds-border-strong)] hover:shadow-sm motion-reduce:transition-none"
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
                            className={cn("border text-xs", STATUS_BADGE[item.frontmatter.status])}
                          >
                            {STATUS_LABEL_KEY[item.frontmatter.status]
                              ? t(STATUS_LABEL_KEY[item.frontmatter.status])
                              : item.frontmatter.status}
                          </Badge>
                          {item.frontmatter.conflict_check_status && (
                            <Badge
                              variant="default"
                              className={cn(
                                "border text-xs",
                                CONFLICT_STATUS_TONE[item.frontmatter.conflict_check_status] ??
                                  CONFLICT_STATUS_TONE.pending
                              )}
                            >
                              {CONFLICT_STATUS_LABEL[item.frontmatter.conflict_check_status] ??
                                item.frontmatter.conflict_check_status}
                            </Badge>
                          )}
                          <span className="text-xs text-[color:var(--ds-text-subtle)]">
                            {SOURCE_LABEL[item.frontmatter.source] ?? item.frontmatter.source}
                          </span>
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
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap tabular-nums">
                          <Clock size={12} aria-hidden="true" />
                          {createdLabel(lang, item.frontmatter.created_at)}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
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
                          className="inline-flex items-center gap-1 text-[color:var(--ds-text)] hover:underline"
                        >
                          <MessageSquareText size={12} aria-hidden="true" />
                          Ursprüngliche Nachricht öffnen
                        </a>
                      )}
                      {item.frontmatter.phone_hash && (
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(item.frontmatter.phone_hash || "");
                            addToast({ type: "info", title: t("intake.toast_copy_hash") });
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[color:var(--ds-text-muted)] transition-[color,transform] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
                        >
                          <Copy size={12} />
                          {t("intake.copy_hash")}
                        </button>
                      )}
                      {item.frontmatter.converted_case_slug && (
                        <a
                          href={`/dashboard/cases/${encodeSlugPath(item.frontmatter.converted_case_slug)}`}
                          className="inline-flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                        >
                          <ArrowUpRight size={12} aria-hidden="true" />
                          {t("intake.converted_case")} öffnen
                        </a>
                      )}
                    </div>

                    {canStartAcceptance(item) && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
                        {caseOptions.length > 0 && (
                          <Select
                            value={conversionTargets[item.slug] || "__new"}
                            onValueChange={(v) =>
                              setConversionTargets((prev) => ({
                                ...prev,
                                [item.slug]: v === "__new" ? "" : v,
                              }))
                            }
                          >
                            <SelectTrigger
                              className="h-9 w-full text-sm sm:w-56"
                              aria-label={t("intake.convert_target")}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__new">Neue Akte anlegen</SelectItem>
                              {caseOptions.map((c) => (
                                <SelectItem key={c.slug} value={c.slug}>
                                  {c.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          onClick={() => startAcceptance(item)}
                          size="sm"
                          className="gap-1.5 whitespace-nowrap"
                        >
                          <Plus size={14} aria-hidden="true" />
                          {t("intake.action_acceptance")}
                        </Button>
                      </div>
                    )}
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
  tone?: "warning" | "danger";
}) {
  // Colour only when there is something to act on (Gestaltungsstandard: keine Farbe bei 0).
  const toneClass =
    value > 0 && tone === "danger"
      ? "text-[color:var(--ds-danger-text)]"
      : value > 0 && tone === "warning"
        ? "text-[color:var(--ds-warning-text)]"
        : "text-[color:var(--ds-text)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}

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

  const urgentCards = triageCards.filter((c) => c.urgency === "critical" || c.urgency === "high");
  if (urgentCards.length === 0) return null;

  const criticalCount = triageCards.filter((c) => c.urgency === "critical").length;
  const highCount = triageCards.filter((c) => c.urgency === "high").length;

  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
      >
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-[color:var(--ds-text-muted)]" aria-hidden="true" />
          <span className="text-sm font-semibold text-[color:var(--ds-text)]">
            Dringende Anfragen
          </span>
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
          {urgentCards.slice(0, 10).map((card) => {
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
                      {URGENCY_LABEL[card.urgency] ?? card.urgency}
                    </Badge>
                    {card.actionType !== "info" && (
                      <span className="text-xs font-medium text-[color:var(--ds-text)]">
                        {ACTION_LABEL[card.actionType] ?? card.actionType}
                      </span>
                    )}
                    {card.legalArea && (
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        {card.legalArea}
                      </span>
                    )}
                    {card.deadline && (
                      <span className="flex items-center gap-1 text-xs text-[color:var(--ds-danger-text)]">
                        <AlertTriangle size={10} />
                        Frist:{" "}
                        {/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(card.deadline)
                          ? card.deadline
                          : formatDate(card.deadline)}
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
                    className="shrink-0 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
                    title={t("intake.aria_details")}
                  >
                    <ChevronRight size={14} />
                  </Link>
                )}
              </div>
            );
          })}
          {urgentCards.length > 10 && (
            <p className="pt-1 text-center text-xs text-[color:var(--ds-text-muted)]">
              +{urgentCards.length - 10} weitere
            </p>
          )}
        </div>
      )}
    </div>
  );
}
