"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { encodeSlugPath } from "@/lib/utils";
import { OFFLINE_KEYS, getCache, setCache } from "@/lib/offline-store";
import type { BrainPage } from "@/lib/types";
import type { AssessmentType, TaxReturnType } from "@/lib/tax-types";
import {
  FileCheck,
  Plus,
  Search,
  RotateCcw,
  X,
  AlertCircle,
  CheckCircle2,
  FileStack,
  Clock,
  Euro,
  Scale,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TaxStatCard, TaxPrecedentSearchPanel, TaxAppealGeneratorPanel } from "@/components/tax";

const TYPE_LABELS_DE: Record<AssessmentType, string> = {
  Einschaetzung: "Einschätzung",
  Festsetzung: "Festsetzung",
  Nachforderung: "Nachforderung",
  Erstattung: "Erstattung",
  Vorauszahlung: "Vorauszahlung",
  Stundung: "Stundung",
  Haftruecklass: "Haft- und Rücklass",
};

const TYPE_LABELS_EN: Record<AssessmentType, string> = {
  Einschaetzung: "Estimate",
  Festsetzung: "Assessment",
  Nachforderung: "Additional Claim",
  Erstattung: "Refund",
  Vorauszahlung: "Advance Payment",
  Stundung: "Deferral",
  Haftruecklass: "Liability & Reserve",
};

const TAX_TYPE_LABELS_DE: Partial<Record<TaxReturnType, string>> = {
  ESt: "ESt",
  USt: "USt",
  GewSt: "GewSt",
  KSt: "KSt",
  SolZ: "SolZ",
  VSt: "VSt",
  GrESt: "GrESt",
  ErbSt: "ErbSt",
  LSt: "LSt",
  UStVA: "UStVA",
  LStA: "LStA",
  ZM: "ZM",
  other: "Sonstige",
};

const TAX_TYPE_LABELS_EN: Partial<Record<TaxReturnType, string>> = {
  ESt: "Income Tax",
  USt: "VAT",
  GewSt: "Trade Tax",
  KSt: "Corporate Tax",
  SolZ: "Sol. Surcharge",
  VSt: "Wealth Tax",
  GrESt: "RE Transfer Tax",
  ErbSt: "Inheritance Tax",
  LSt: "Wage Tax",
  UStVA: "VAT Pre-Reg",
  LStA: "Wage Tax Reg",
  ZM: "Summary Report",
  other: "Other",
};

interface AssessmentRow {
  slug: string;
  clientName: string;
  type: AssessmentType;
  taxType: TaxReturnType;
  year: number;
  noticeNumber?: string;
  noticeDate?: string;
  dueDate?: string;
  amount: number;
  paidDate?: string;
  contested?: boolean;
}

function pageToRow(page: BrainPage): AssessmentRow {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: page.slug,
    clientName: String(fm.client_name ?? "—"),
    type: (fm.assessment_type as AssessmentType) ?? "Festsetzung",
    taxType: (fm.tax_type as TaxReturnType) ?? "ESt",
    year: Number(fm.year ?? new Date().getFullYear()),
    noticeNumber: fm.notice_number ? String(fm.notice_number) : undefined,
    noticeDate: fm.notice_date ? String(fm.notice_date).slice(0, 10) : undefined,
    dueDate: fm.due_date ? String(fm.due_date).slice(0, 10) : undefined,
    amount: typeof fm.amount === "number" ? fm.amount : 0,
    paidDate: fm.paid_date ? String(fm.paid_date).slice(0, 10) : undefined,
    contested: Boolean(fm.contested),
  };
}

export default function TaxAssessmentsPage() {
  const router = useRouter();
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssessmentType | "all">("all");
  const [taxTypeFilter, setTaxTypeFilter] = useState<TaxReturnType | "all">("all");
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    clientName: "",
    type: "Festsetzung" as AssessmentType,
    taxType: "ESt" as TaxReturnType,
    year: new Date().getFullYear(),
    noticeNumber: "",
    noticeDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    amount: 0,
    notes: "",
  });

  const typeLabels = lang === "en" ? TYPE_LABELS_EN : TYPE_LABELS_DE;
  const taxTypeLabels = lang === "en" ? TAX_TYPE_LABELS_EN : TAX_TYPE_LABELS_DE;

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.tax.assessments.list({ limit: 200 });
      const rows = (Array.isArray(pages) ? pages : []).map(pageToRow);
      rows.sort((a, b) => b.year - a.year || a.clientName.localeCompare(b.clientName));
      await setCache(OFFLINE_KEYS.taxAssessments, rows);
      setAssessments(rows);
    } catch (err) {
      const cached = await getCache<AssessmentRow[]>(OFFLINE_KEYS.taxAssessments);
      if (cached) {
        setAssessments(cached);
        setLoadError(null);
      } else {
        setLoadError(err instanceof Error ? err.message : t("tax.assessments.error_load"));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAssessments();
  }, [loadAssessments]);

  const filtered = useMemo(() => {
    return assessments.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${a.clientName} ${a.noticeNumber ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (taxTypeFilter !== "all" && a.taxType !== taxTypeFilter) return false;
      return true;
    });
  }, [assessments, search, typeFilter, taxTypeFilter]);

  const openCount = assessments.filter((a) => !a.paidDate && !a.contested).length;
  const contestedCount = assessments.filter((a) => a.contested).length;
  const totalAmount = assessments.reduce((s, a) => s + a.amount, 0);

  async function createAssessment() {
    if (!createForm.clientName.trim() || !createForm.noticeDate) return;
    setCreateLoading(true);
    try {
      await api.tax.assessments.create({
        clientName: createForm.clientName.trim(),
        type: createForm.type,
        taxType: createForm.taxType,
        year: createForm.year,
        noticeNumber: createForm.noticeNumber.trim() || undefined,
        noticeDate: createForm.noticeDate,
        dueDate: createForm.dueDate || undefined,
        amount: createForm.amount,
        notes: createForm.notes.trim() || undefined,
      });
      addToast({ type: "success", title: t("tax.assessments.toast_created") });
      setCreateForm({
        clientName: "",
        type: "Festsetzung",
        taxType: "ESt",
        year: new Date().getFullYear(),
        noticeNumber: "",
        noticeDate: new Date().toISOString().slice(0, 10),
        dueDate: "",
        amount: 0,
        notes: "",
      });
      setCreateOpen(false);
      await loadAssessments();
    } catch (err) {
      addToast({
        type: "error",
        title: t("tax.assessments.toast_create_fail"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tax.assessments.title")}
        description={t("tax.assessments.desc")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("tax.assessments.title") },
        ]}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="brand-bg gap-2 text-white">
            <Plus size={16} />
            {t("tax.assessments.new")}
          </Button>
        }
      />

      {/* Stats */}
      {!loading && assessments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TaxStatCard
            label={t("tax.assessments.stat_total")}
            value={assessments.length}
            icon={FileStack}
          />
          <TaxStatCard
            label={t("tax.assessments.stat_open")}
            value={openCount}
            icon={Clock}
            colorVar="--ds-warning-text"
          />
          <TaxStatCard
            label={t("tax.assessments.stat_contested")}
            value={contestedCount}
            icon={AlertCircle}
            colorVar="--ds-danger-text"
          />
          <TaxStatCard
            label={t("tax.assessments.stat_amount")}
            value={`${totalAmount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`}
            icon={Euro}
          />
        </div>
      )}

      {/* Search + Filters */}
      {!loading && assessments.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("tax.assessments.search")}
              aria-label={t("tax.assessments.search")}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                aria-label="Clear"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AssessmentType | "all")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="all">{t("tax.assessments.all_types")}</option>
            {Object.entries(typeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={taxTypeFilter}
            onChange={(e) => setTaxTypeFilter(e.target.value as TaxReturnType | "all")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="all">{t("tax.assessments.all_tax_types")}</option>
            {Object.entries(taxTypeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Error with retry */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadAssessments()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} />
            {t("tax.assessments.retry")}
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-5 w-20 rounded" />
              </div>
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileCheck size={48} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-4 text-sm text-[color:var(--ds-text-subtle)]">
            {t("tax.assessments.empty_title")}
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("tax.assessments.empty_hint")}
          </p>
          <Button onClick={() => setCreateOpen(true)} className="brand-bg mt-4 gap-2 text-white">
            <Plus size={16} />
            {t("tax.assessments.new")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search size={36} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-3 text-sm text-[color:var(--ds-text-subtle)]">
            {t("tax.assessments.empty_filtered")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_client")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_type")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_tax_type")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_notice_no")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_date")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_due")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_amount")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.assessments.col_status")}</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.slug}
                    onClick={() =>
                      router.push(`/dashboard/tax-assessments/${encodeSlugPath(a.slug)}`)
                    }
                    className="cursor-pointer border-b border-[color:var(--ds-border)]/50 transition-colors last:border-0 hover:bg-[color:var(--ds-hover)]"
                  >
                    <td className="px-5 py-3 font-medium text-[color:var(--ds-text)]">
                      {a.clientName}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {typeLabels[a.type]}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {taxTypeLabels[a.taxType] ?? a.taxType}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {a.noticeNumber ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {a.noticeDate ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {a.dueDate ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {a.amount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
                    </td>
                    <td className="px-5 py-3">
                      {a.contested ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                          <AlertCircle size={12} /> {lang === "en" ? "Contested" : "Angefochten"}
                        </span>
                      ) : a.paidDate ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                          <CheckCircle2 size={12} /> {lang === "en" ? "Paid" : "Bezahlt"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-text-subtle)]">
                          {lang === "en" ? "Open" : "Offen"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSlug(a.slug);
                        }}
                        className="h-7 gap-1 px-2 text-xs text-[color:var(--brand-primary)] hover:bg-[color:var(--brand-soft)]"
                      >
                        <Scale size={12} />
                        {t("tax.precedent.title")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Panels: Appeal Generator + Precedent Search */}
      {selectedSlug && (
        <div className="space-y-4">
          <TaxAppealGeneratorPanel assessmentSlug={selectedSlug} />
          <TaxPrecedentSearchPanel />
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tax.assessments.modal_title")}</DialogTitle>
            <DialogDescription>{t("tax.assessments.modal_desc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.assessments.label_client")} *
              </label>
              <Input
                value={createForm.clientName}
                onChange={(e) => setCreateForm((p) => ({ ...p, clientName: e.target.value }))}
                placeholder={t("tax.assessments.label_client")}
                autoFocus
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.assessments.label_type")}
                </label>
                <select
                  value={createForm.type}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, type: e.target.value as AssessmentType }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {Object.entries(typeLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.assessments.label_year")}
                </label>
                <Input
                  type="number"
                  value={createForm.year}
                  onChange={(e) => setCreateForm((p) => ({ ...p, year: Number(e.target.value) }))}
                  min={2000}
                  max={new Date().getFullYear() + 1}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.assessments.label_notice_no")}
              </label>
              <Input
                value={createForm.noticeNumber}
                onChange={(e) => setCreateForm((p) => ({ ...p, noticeNumber: e.target.value }))}
                placeholder={t("tax.assessments.label_notice_no")}
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.assessments.label_notice_date")} *
                </label>
                <Input
                  type="date"
                  value={createForm.noticeDate}
                  onChange={(e) => setCreateForm((p) => ({ ...p, noticeDate: e.target.value }))}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.assessments.label_due")}
                </label>
                <Input
                  type="date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm((p) => ({ ...p, dueDate: e.target.value }))}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.assessments.label_amount")}
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={createForm.amount}
                  onChange={(e) => setCreateForm((p) => ({ ...p, amount: Number(e.target.value) }))}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.assessments.label_tax_type")}
                </label>
                <select
                  value={createForm.taxType}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, taxType: e.target.value as TaxReturnType }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {Object.entries(taxTypeLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.assessments.label_notes")}
              </label>
              <textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
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
              {t("tax.assessments.btn_cancel")}
            </Button>
            <Button
              type="button"
              disabled={createLoading || !createForm.clientName.trim() || !createForm.noticeDate}
              onClick={() => void createAssessment()}
              className="brand-bg gap-2 text-white"
            >
              {createLoading ? (
                <RotateCcw size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {createLoading ? t("tax.assessments.btn_creating") : t("tax.assessments.btn_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
