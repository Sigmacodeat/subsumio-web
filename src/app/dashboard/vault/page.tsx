"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/use-lang";
import { useFieldArray } from "react-hook-form";
import {
  Search,
  Loader2,
  FileText,
  X,
  Trash2,
  Download,
  FileSearch,
  Table2,
  Filter,
  Clock,
  Tag,
  AlertTriangle,
  Briefcase,
  BookOpen,
  Upload,
  FolderInput,
  ArrowUpDown,
  RotateCcw,
  Languages,
  FileSignature,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { BrainPage, TabularReviewResponse } from "@/lib/types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useDashboardForm } from "@/lib/hooks/use-dashboard-form";
import { vaultReviewSchema } from "@/lib/schemas/vault";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePaginatedList } from "@/lib/hooks/use-pagination";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/dashboard/page-header";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";
import { EmptyState } from "@/components/dashboard/empty-state";

const DOCS_LIMIT = 200;

function HubLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Search;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface VaultDoc {
  slug: string;
  title: string;
  type: string;
  source?: string;
  tags: string[];
  size?: number;
  createdAt: string;
  content: string;
  extractionStatus?: string;
  extractionMethod?: string;
  docType?: string;
  docTypeLabel?: string;
  caseSlug?: string;
  isSplitParent?: boolean;
  partOf?: string;
  partCount?: number;
}

function useTypeLabels(t: ReturnType<typeof useLang>["t"]): Record<string, string> {
  return {
    legal_case: t("vault.type_legal_case"),
    legal_contract: t("vault.type_legal_contract"),
    legal_document: t("vault.type_legal_document"),
    bea_message: t("vault.type_bea_message"),
    court_decision: t("vault.type_court_decision"),
    invoice: t("vault.type_invoice"),
    contact: t("vault.type_contact"),
    evidence: t("vault.type_evidence"),
  };
}

const TYPE_COLORS: Record<string, string> = {
  legal_case: "brand-soft brand-border brand-text",
  legal_contract:
    "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
  legal_document:
    "bg-[color:var(--ds-info-bg)] border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]",
  bea_message:
    "bg-[color:var(--ds-warning-bg)] border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]",
  court_decision:
    "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
  invoice:
    "bg-[color:var(--ds-info-bg)] border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]",
  contact:
    "bg-[color:var(--ds-hover)] border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]",
  evidence:
    "bg-[color:var(--ds-warning-bg)] border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]",
};

function parseDoc(page: BrainPage): VaultDoc {
  const fm = page.frontmatter ?? {};
  return {
    slug: page.slug,
    title: page.title,
    type: page.type || "legal_document",
    source: (fm.source as string) || undefined,
    tags: page.tags || [],
    size: (fm.size as number) || undefined,
    createdAt:
      ((page as unknown as Record<string, unknown>).createdAt as string) ||
      ((page as unknown as Record<string, unknown>).created_at as string) ||
      new Date().toISOString(),
    content: page.content || "",
    extractionStatus: (fm.extraction_status as string) || undefined,
    extractionMethod: (fm.extraction_method as string) || undefined,
    docType: (fm.doc_type as string) || undefined,
    docTypeLabel: (fm.doc_type_label as string) || undefined,
    caseSlug: (fm.case_slug as string) || undefined,
    isSplitParent: fm.is_split_parent === true || fm.is_split_parent === "true",
    partOf: (fm.part_of as string) || undefined,
    partCount: (fm.part_count as number) || undefined,
  };
}

type SortKey = "date_desc" | "date_asc" | "title_asc" | "title_desc" | "size_desc";

export default function VaultPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const TYPE_LABELS = useTypeLabels(t);
  const confirm = useConfirm();
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VaultDoc[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");

  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [showReview, setShowReview] = useState(false);
  const [reviewResult, setReviewResult] = useState<TabularReviewResponse | null>(null);
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [deepAnalysisPrompt, setDeepAnalysisPrompt] = useState("");
  const [deepAnalysisResult, setDeepAnalysisResult] = useState<{
    executive_summary: string;
    document_count: number;
    findings: Array<{
      theme: string;
      description: string;
      risk_level: "low" | "medium" | "high" | "critical";
      affected_documents: string[];
      citations: Array<{ slug: string; title: string; quote: string }>;
    }>;
    cross_document_patterns: string[];
    overall_risk: "low" | "medium" | "high" | "critical";
    warnings: string[];
    attorney_review_required: true;
  } | null>(null);
  const [deepAnalysisError, setDeepAnalysisError] = useState<string | null>(null);

  const reviewForm = useDashboardForm({
    schema: vaultReviewSchema,
    defaultValues: {
      questions: [t("vault.q_deadlines"), t("vault.q_parties"), t("vault.q_liability")],
    },
    onSubmit: async (data) => {
      if (selectedSlugs.size === 0) {
        throw new Error(t("vault.err_min_select"));
      }
      const qs = data.questions.map((q) => q.trim()).filter(Boolean);
      const res = await api.legal.tabularReview({
        slugs: Array.from(selectedSlugs),
        questions: qs,
      });
      setReviewResult(res);
      if (res.rows.length === 0) {
        throw new Error(t("vault.err_no_results"));
      }
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: reviewForm.form.control as never,
    name: "questions",
  });

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.brain.listPages({ limit: DOCS_LIMIT });
      setCapped(pages.length >= DOCS_LIMIT);
      const nextDocs = pages.map(parseDoc);
      setDocs(nextDocs);
      await setCache(OFFLINE_KEYS.vault, nextDocs);
    } catch (err) {
      const cached = await getCache<VaultDoc[]>(OFFLINE_KEYS.vault);
      if (cached) {
        setDocs(cached);
        setLoadError(t("vault.err_cloud_unreachable"));
      } else {
        setLoadError(err instanceof Error ? err.message : t("vault.err_load_failed"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    docs.forEach((d) => d.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [docs]);

  const allTypes = useMemo(() => {
    const typeSet = new Set<string>();
    docs.forEach((d) => typeSet.add(d.type));
    return Array.from(typeSet).sort();
  }, [docs]);

  // Debounced server-side search so matches beyond the first DOCS_LIMIT
  // loaded documents are still found, instead of only filtering the
  // capped client-side `docs` list.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const pages = await api.brain.listPages({ q, limit: DOCS_LIMIT });
        if (!cancelled) setSearchResults(pages.map(parseDoc));
      } catch {
        // Fall back to filtering the already-loaded docs client-side below.
        if (!cancelled) setSearchResults(null);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = q && searchResults ? searchResults : docs;
    if (q && !searchResults) {
      result = result.filter(
        (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") result = result.filter((d) => d.type === typeFilter);
    if (tagFilter !== "all") result = result.filter((d) => d.tags.includes(tagFilter));
    if (statusFilter !== "all") {
      if (statusFilter === "processing") {
        result = result.filter(
          (d) => d.extractionStatus === "processing" || d.extractionStatus === "uploaded"
        );
      } else if (statusFilter === "failed") {
        result = result.filter(
          (d) => d.extractionStatus === "failed" || d.extractionStatus === "error"
        );
      } else if (statusFilter === "ready") {
        result = result.filter((d) => !d.extractionStatus || d.extractionStatus === "ready");
      } else {
        result = result.filter((d) => d.extractionStatus === statusFilter);
      }
    }
    // Sort
    const sorted = [...result];
    switch (sortBy) {
      case "date_desc":
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "date_asc":
        sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "title_asc":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "title_desc":
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "size_desc":
        sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
        break;
    }
    return sorted;
  }, [docs, searchResults, query, typeFilter, tagFilter, statusFilter, sortBy]);

  const reviewLoading = reviewForm.status === "submitting";

  const {
    items: paginatedDocs,
    page,
    totalPages,
    setPage,
    startIndex,
    endIndex,
  } = usePaginatedList(filtered, 24);

  async function deleteDoc(slug: string) {
    const ok = await confirm({
      title: t("vault.confirm_delete_title"),
      message: t("vault.confirm_delete_msg"),
      confirmLabel: t("vault.confirm_delete_btn"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      if (isOnline()) {
        await api.brain.deletePage(slug);
      } else {
        await enqueueMutation({ type: "deletePage", payload: { slug } });
      }
      const nextDocs = docs.filter((d) => d.slug !== slug);
      setDocs(nextDocs);
      await setCache(OFFLINE_KEYS.vault, nextDocs);
      setSelectedSlugs((s) => {
        const ns = new Set(s);
        ns.delete(slug);
        return ns;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("vault.err_delete_failed"));
    }
  }

  function toggleSelect(slug: string) {
    setSelectedSlugs((s) => {
      const ns = new Set(s);
      if (ns.has(slug)) ns.delete(slug);
      else ns.add(slug);
      return ns;
    });
  }

  function selectAll() {
    setSelectedSlugs(new Set(filtered.map((d) => d.slug)));
  }

  function deselectAll() {
    setSelectedSlugs(new Set());
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("vault.title")}
        description={t("vault.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("vault.breadcrumb") },
        ]}
        actions={
          selectedSlugs.size > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => setShowReview(!showReview)}
              >
                <Table2 size={14} /> {t("vault.bulk_review_count")} ({selectedSlugs.size})
              </Button>
              <Button
                variant="glow"
                className="gap-2"
                onClick={() => setShowDeepAnalysis(!showDeepAnalysis)}
              >
                <Sparkles size={14} /> {lang === "en" ? "Deep Analysis" : "Tiefenanalyse"} (
                {selectedSlugs.size})
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-2 sm:grid-cols-4">
        <HubLink href="/dashboard/analyze" icon={FileSearch} label={t("nav.analyze")} />
        <HubLink href="/dashboard/translate" icon={Languages} label={t("nav.translate")} />
        <HubLink href="/dashboard/signature" icon={FileSignature} label={t("nav.signature")} />
        <HubLink href="/dashboard/tabular-review" icon={Table2} label={t("nav.tabular_review")} />
      </div>

      {/* Prominente Upload-CTAs: Dokument zu Akte / Kanzleiwissen importieren */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/dashboard/upload?mode=case"
          className="group flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-all hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10">
            <Briefcase size={18} className="brand-text" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("vault.cta_case_upload")}
              </span>
              <Upload size={12} className="text-[color:var(--ds-text-subtle)]" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {t("vault.cta_case_upload_desc")}
            </p>
          </div>
        </Link>
        <Link
          href="/dashboard/upload?mode=knowledge"
          className="group flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-all hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-success-bg)]">
            <BookOpen size={18} className="text-[color:var(--ds-success-text)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("vault.cta_knowledge_import")}
              </span>
              <FolderInput size={12} className="text-[color:var(--ds-text-subtle)]" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {t("vault.cta_knowledge_import_desc")}
            </p>
          </div>
        </Link>
      </div>

      {capped && !query.trim() && <CappedResultsNotice limit={DOCS_LIMIT} />}

      {/* Result count + sort control */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--ds-text-muted)]">
          <span>
            {filtered.length} {t("vault.results_count")}
            {filtered.length !== docs.length && ` (${docs.length} ${t("vault.total_count")})`}
          </span>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={12} className="text-[color:var(--ds-text-subtle)]" />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-7 w-auto gap-1 rounded-md px-2 py-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_desc">{t("vault.sort_date_desc")}</SelectItem>
                <SelectItem value="date_asc">{t("vault.sort_date_asc")}</SelectItem>
                <SelectItem value="title_asc">{t("vault.sort_title_asc")}</SelectItem>
                <SelectItem value="title_desc">{t("vault.sort_title_desc")}</SelectItem>
                <SelectItem value="size_desc">{t("vault.sort_size_desc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showReview && (
        <form
          onSubmit={reviewForm.handleSubmit}
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("vault.bulk_analysis")} {selectedSlugs.size} {t("vault.selected_docs")}
            </h3>
            <button
              type="button"
              onClick={() => setShowReview(false)}
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              <X size={16} />
            </button>
          </div>
          {reviewForm.error && (
            <div className="flex items-center gap-2 text-xs text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={14} /> {reviewForm.error}
            </div>
          )}
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  {...reviewForm.form.register(`questions.${i}`)}
                  placeholder={`${t("vault.question_placeholder")} ${i + 1}`}
                  className="flex-1 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {fields.length < 8 && (
              <button
                type="button"
                onClick={() => append("")}
                className="brand-text text-xs hover:underline"
              >
                {t("vault.add_question")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={reviewLoading} className="gap-2">
              {reviewLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileSearch size={14} />
              )}
              {reviewLoading ? t("vault.analyzing") : t("vault.start_bulk")}
            </Button>
            {reviewResult && reviewResult.rows.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => {
                  const csv = [
                    ["Dokument", ...reviewResult.questions].join(";"),
                    ...reviewResult.rows.map((r) =>
                      [r.title, ...r.cells.map((cell) => cell.answer.replace(/"/g, '""'))].join(";")
                    ),
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `vault-review-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={14} /> {t("vault.csv_export")}
              </Button>
            )}
          </div>
          {reviewResult && reviewResult.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ds-border)]">
                    <th className="px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]">
                      {t("vault.col_document")}
                    </th>
                    {reviewResult.questions.map((q, i) => (
                      <th
                        key={i}
                        className="min-w-[200px] px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]"
                      >
                        {q}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewResult.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-[color:var(--ds-border)]/50 hover:bg-[color:var(--ds-hover)]"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-[color:var(--ds-text)]">
                        {row.title}
                      </td>
                      {row.cells.map((cell, j) => (
                        <td
                          key={j}
                          className="max-w-xs truncate px-3 py-2 text-[color:var(--ds-text-muted)]"
                          title={cell.answer}
                        >
                          {cell.answer}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
      )}

      {/* Deep Analysis Panel */}
      {showDeepAnalysis && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
              <Sparkles size={16} className="brand-text" />
              {lang === "en" ? "Deep Analysis" : "Tiefenanalyse"}
              <span className="text-xs font-normal text-[color:var(--ds-text-muted)]">
                ({selectedSlugs.size} {lang === "en" ? "documents" : "Dokumente"})
              </span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowDeepAnalysis(false);
                setDeepAnalysisResult(null);
                setDeepAnalysisError(null);
              }}
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              <X size={16} />
            </button>
          </div>

          {deepAnalysisError && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertTriangle size={14} /> {deepAnalysisError}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              {lang === "en" ? "Analysis prompt (optional)" : "Analyse-Prompt (optional)"}
            </label>
            <Input
              value={deepAnalysisPrompt}
              onChange={(e) => setDeepAnalysisPrompt(e.target.value)}
              placeholder={
                lang === "en"
                  ? "e.g. Identify liability risks and compliance gaps across these documents"
                  : "z.B. Identifiziere Haftungsrisiken und Compliance-Lücken über alle Dokumente"
              }
            />
            <p className="text-[10px] text-[color:var(--ds-text-subtle)]">
              {lang === "en"
                ? "Generates a narrative report with cross-document insights, themes, and risks — every claim grounded with verbatim citations."
                : "Generiert einen narrativen Bericht mit übergreifenden Erkenntnissen, Themen und Risiken — jeder Anspruch mit wörtlichen Zitaten belegt."}
            </p>
          </div>

          <Button
            onClick={async () => {
              if (selectedSlugs.size === 0) return;
              setDeepAnalysisLoading(true);
              setDeepAnalysisError(null);
              setDeepAnalysisResult(null);
              try {
                const result = await api.legal.deepAnalysis({
                  slugs: Array.from(selectedSlugs),
                  prompt: deepAnalysisPrompt || undefined,
                });
                setDeepAnalysisResult(result);
              } catch (e) {
                setDeepAnalysisError(
                  e instanceof Error ? e.message : "Deep Analysis fehlgeschlagen"
                );
              } finally {
                setDeepAnalysisLoading(false);
              }
            }}
            disabled={deepAnalysisLoading || selectedSlugs.size === 0}
            className="gap-2"
          >
            {deepAnalysisLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {deepAnalysisLoading
              ? lang === "en"
                ? "Analyzing..."
                : "Analysiere..."
              : lang === "en"
                ? "Run Deep Analysis"
                : "Tiefenanalyse starten"}
          </Button>

          {deepAnalysisResult && (
            <div className="space-y-4">
              {/* Warnings */}
              {deepAnalysisResult.warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  {deepAnalysisResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-amber-700">
                      <AlertTriangle size={10} /> {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Overall risk badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {lang === "en" ? "Overall Risk" : "Gesamtrisiko"}:
                </span>
                <Badge
                  variant={
                    deepAnalysisResult.overall_risk === "critical"
                      ? "danger"
                      : deepAnalysisResult.overall_risk === "high"
                        ? "danger"
                        : deepAnalysisResult.overall_risk === "medium"
                          ? "warning"
                          : "default"
                  }
                  className="text-xs"
                >
                  {deepAnalysisResult.overall_risk}
                </Badge>
                <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                  {deepAnalysisResult.document_count}{" "}
                  {lang === "en" ? "documents analyzed" : "Dokumente analysiert"}
                </span>
              </div>

              {/* Executive summary */}
              {deepAnalysisResult.executive_summary && (
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3">
                  <h4 className="mb-1 text-xs font-semibold text-[color:var(--ds-text)]">
                    {lang === "en" ? "Executive Summary" : "Zusammenfassung"}
                  </h4>
                  <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                    {deepAnalysisResult.executive_summary}
                  </p>
                </div>
              )}

              {/* Findings */}
              {deepAnalysisResult.findings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[color:var(--ds-text)]">
                    {lang === "en" ? "Findings" : "Ergebnisse"}
                  </h4>
                  {deepAnalysisResult.findings.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant={
                            f.risk_level === "critical" || f.risk_level === "high"
                              ? "danger"
                              : f.risk_level === "medium"
                                ? "warning"
                                : "default"
                          }
                          className="text-[10px]"
                        >
                          {f.risk_level}
                        </Badge>
                        <span className="text-xs font-medium text-[color:var(--ds-text)]">
                          {f.theme}
                        </span>
                      </div>
                      <p className="mb-2 text-xs text-[color:var(--ds-text-muted)]">
                        {f.description}
                      </p>
                      {f.affected_documents.length > 0 && (
                        <div className="mb-1 flex flex-wrap gap-1">
                          {f.affected_documents.map((d) => (
                            <Badge key={d} variant="default" className="text-[10px]">
                              {d}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {f.citations.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {f.citations.slice(0, 3).map((c, j) => (
                            <div
                              key={j}
                              className="flex items-start gap-1 text-[10px] text-[color:var(--ds-text-subtle)]"
                            >
                              <span className="brand-text">»</span>
                              <span className="italic">{c.quote}</span>
                              <span className="shrink-0">— {c.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Cross-document patterns */}
              {deepAnalysisResult.cross_document_patterns.length > 0 && (
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3">
                  <h4 className="mb-1 text-xs font-semibold text-[color:var(--ds-text)]">
                    {lang === "en" ? "Cross-Document Patterns" : "Übergreifende Muster"}
                  </h4>
                  <ul className="space-y-1">
                    {deepAnalysisResult.cross_document_patterns.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1.5 text-xs text-[color:var(--ds-text-muted)]"
                      >
                        <span className="brand-text mt-0.5">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Attorney review notice */}
              {deepAnalysisResult.attorney_review_required && (
                <p className="text-[10px] text-[color:var(--ds-text-subtle)]">
                  {lang === "en"
                    ? "⚠ This automated analysis does not replace attorney review."
                    : "⚠ Diese automatisierte Analyse ersetzt keine anwaltliche Prüfung."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("vault.search_placeholder")}
            aria-label={t("aria.search_docs")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
          />
          {searching && (
            <Loader2
              size={14}
              className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-[color:var(--ds-text-subtle)]"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-[color:var(--ds-text-subtle)]" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]" aria-label={t("vault.all_types")}>
              <SelectValue placeholder={t("vault.all_types")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("vault.all_types")}</SelectItem>
              {allTypes.map((tp) => (
                <SelectItem key={tp} value={tp}>
                  {TYPE_LABELS[tp] || tp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[160px]" aria-label={t("vault.all_tags")}>
              <SelectValue placeholder={t("vault.all_tags")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("vault.all_tags")}</SelectItem>
              {allTags.map((tp) => (
                <SelectItem key={tp} value={tp}>
                  {tp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="w-[160px]"
              aria-label={lang === "en" ? "All statuses" : "Alle Status"}
            >
              <SelectValue placeholder={lang === "en" ? "All statuses" : "Alle Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "en" ? "All statuses" : "Alle Status"}</SelectItem>
              <SelectItem value="ready">{lang === "en" ? "Ready" : "Bereit"}</SelectItem>
              <SelectItem value="processing">
                {lang === "en" ? "Processing" : "In Verarbeitung"}
              </SelectItem>
              <SelectItem value="failed">{lang === "en" ? "Failed" : "Fehlgeschlagen"}</SelectItem>
              <SelectItem value="ocr_needed">
                {lang === "en" ? "OCR needed" : "OCR nötig"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedSlugs.size > 0 && (
        <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
          <span>
            {selectedSlugs.size} {t("vault.selected_count")}
          </span>
          <button onClick={selectAll} className="brand-text hover:underline">
            {t("vault.select_all")}
          </button>
          <button onClick={deselectAll} className="brand-text hover:underline">
            {t("vault.deselect_all")}
          </button>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDocs()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} /> {t("vault.retry")}
          </Button>
        </div>
      )}

      {loading ? (
        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3"
          role="status"
          aria-label={t("aria.loading")}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2.5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-pulse rounded bg-[color:var(--ds-surface-2)]" />
                <div className="h-5 w-20 animate-pulse rounded bg-[color:var(--ds-surface-2)]" />
              </div>
              <div className="h-4 w-full animate-pulse rounded bg-[color:var(--ds-surface-2)]" />
              <div className="h-3 w-full animate-pulse rounded bg-[color:var(--ds-surface-2)]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--ds-surface-2)]" />
              <div className="flex items-center justify-between pt-1">
                <div className="h-3 w-24 animate-pulse rounded bg-[color:var(--ds-surface-2)]" />
                <div className="h-3 w-12 animate-pulse rounded bg-[color:var(--ds-surface-2)]" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("vault.empty_title")}
          description={docs.length === 0 ? t("vault.empty_upload") : t("vault.empty_filter")}
          actionLabel={docs.length === 0 ? t("vault.empty_upload_cta") : undefined}
          onAction={docs.length === 0 ? () => router.push("/dashboard/upload") : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {paginatedDocs.map((doc) => (
              <div
                key={doc.slug}
                className="group space-y-2.5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-colors focus-within:border-[color:var(--ds-border-strong)] hover:border-[color:var(--ds-border-strong)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selectedSlugs.has(doc.slug)}
                      onChange={() => toggleSelect(doc.slug)}
                      className="accent-[var(--brand-primary)]"
                      aria-label={t("vault.select_doc")}
                    />
                    <Badge
                      variant="default"
                      className={`border text-xs ${TYPE_COLORS[doc.type] || "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"}`}
                    >
                      {TYPE_LABELS[doc.type] || doc.type}
                    </Badge>
                    {doc.docTypeLabel && (
                      <Badge
                        variant="default"
                        className="border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-xs text-[color:var(--ds-info-text)]"
                      >
                        {doc.docTypeLabel}
                      </Badge>
                    )}
                    {doc.extractionStatus && doc.extractionStatus !== "ready" && (
                      <Badge
                        variant="default"
                        className={`border text-xs ${
                          doc.extractionStatus === "failed" || doc.extractionStatus === "error"
                            ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                            : doc.extractionStatus === "processing" ||
                                doc.extractionStatus === "uploaded"
                              ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                              : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                        }`}
                      >
                        {doc.extractionStatus === "failed" || doc.extractionStatus === "error"
                          ? lang === "en"
                            ? "Extraction failed"
                            : "Extraktion fehlgeschlagen"
                          : doc.extractionStatus === "processing" ||
                              doc.extractionStatus === "uploaded"
                            ? lang === "en"
                              ? "Processing…"
                              : "Wird verarbeitet…"
                            : doc.extractionStatus === "ocr_needed"
                              ? lang === "en"
                                ? "OCR needed"
                                : "OCR nötig"
                              : doc.extractionStatus}
                      </Badge>
                    )}
                    {doc.isSplitParent && (
                      <Badge
                        variant="default"
                        className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                      >
                        {doc.partCount
                          ? `${doc.partCount} ${lang === "en" ? "parts" : "Teile"}`
                          : lang === "en"
                            ? "Split parent"
                            : "Gesplittet"}
                      </Badge>
                    )}
                    {doc.partOf && (
                      <Badge
                        variant="default"
                        className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                      >
                        {lang === "en" ? "Part of" : "Teil von"} {doc.partOf.split("/").pop()}
                      </Badge>
                    )}
                  </div>
                  <button
                    onClick={() => deleteDoc(doc.slug)}
                    className="rounded-lg p-1 text-[color:var(--ds-text-muted)] opacity-60 transition-opacity duration-200 group-hover:opacity-100 hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--ds-danger-border)] focus-visible:outline-none"
                    title={t("vault.delete")}
                    aria-label={t("vault.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <Link
                  href={`/dashboard/brain/${encodeURIComponent(doc.slug)}`}
                  className="block truncate text-sm font-medium text-[color:var(--ds-text)] transition-colors hover:text-[color:var(--brand-primary)] focus-visible:text-[color:var(--brand-primary)] focus-visible:outline-none"
                  title={doc.title}
                >
                  {doc.title}
                </Link>
                <div className="line-clamp-2 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                  {doc.content ? doc.content.slice(0, 120) : ""}
                  {doc.content && doc.content.length > 120 ? "…" : ""}
                </div>
                {doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]"
                      >
                        <Tag size={9} />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(doc.createdAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                  </span>
                  <span className="flex items-center gap-2">
                    {doc.caseSlug && (
                      <Link
                        href={`/dashboard/brain/${encodeURIComponent(doc.caseSlug)}`}
                        className="flex items-center gap-1 hover:text-[color:var(--brand-primary)]"
                        title={doc.caseSlug}
                      >
                        <Briefcase size={10} />
                        {doc.caseSlug.split("/").pop()}
                      </Link>
                    )}
                    {doc.size ? <span>{formatFileSize(doc.size)}</span> : null}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 px-1 py-3 text-sm">
              <span className="text-[color:var(--ds-text-muted)]">
                {startIndex + 1}–{endIndex} {t("vault.pagination_of")} {filtered.length}
              </span>
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
