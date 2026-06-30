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
import type { TaxReturnType, TaxReturnStatus } from "@/lib/tax-types";
import { FileText, Plus, Search, RotateCcw, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const STATUS_COLORS: Record<TaxReturnStatus, string> = {
  draft: "border-slate-500/20 bg-slate-500/10 text-slate-600",
  in_progress: "border-blue-500/20 bg-blue-500/10 text-blue-600",
  review: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  submitted: "border-violet-500/20 bg-violet-500/10 text-violet-600",
  assessed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  corrected: "border-orange-500/20 bg-orange-500/10 text-orange-600",
  closed: "border-slate-500/20 bg-slate-500/10 text-slate-600",
};

const TYPE_LABELS: Record<TaxReturnType, string> = {
  ESt: "Einkommensteuer",
  USt: "Umsatzsteuer",
  GewSt: "Gewerbesteuer",
  KSt: "Körperschaftsteuer",
  SolZ: "Solidaritätszuschlag",
  VSt: "Vermögensteuer",
  GrESt: "Grunderwerbsteuer",
  ErbSt: "Erbschaftsteuer",
  LSt: "Lohnsteuer",
  UStVA: "USt-Voranmeldung",
  LStA: "Lohnsteuer-Anmeldung",
  ZM: "Zusammenfassende Meldung",
  other: "Sonstige",
};

const STATUS_LABELS: Record<TaxReturnStatus, string> = {
  draft: "Entwurf",
  in_progress: "In Bearbeitung",
  review: "Zur Prüfung",
  submitted: "Eingereicht",
  assessed: "Veranlagt",
  corrected: "Korrigiert",
  closed: "Abgeschlossen",
};

interface TaxReturnRow {
  slug: string;
  clientName: string;
  type: TaxReturnType;
  year: number;
  status: TaxReturnStatus;
  dueDate?: string;
  taxAmount?: number;
}

function pageToRow(page: BrainPage): TaxReturnRow {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: page.slug,
    clientName: String(fm.client_name ?? "—"),
    type: (fm.tax_type as TaxReturnType) ?? "other",
    year: Number(fm.year ?? new Date().getFullYear()),
    status: (fm.status as TaxReturnStatus) ?? "draft",
    dueDate: fm.due_date ? String(fm.due_date).slice(0, 10) : undefined,
    taxAmount: typeof fm.tax_amount === "number" ? fm.tax_amount : undefined,
  };
}

export default function TaxReturnsPage() {
  const router = useRouter();
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaxReturnStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<TaxReturnType | "all">("all");
  const [returns, setReturns] = useState<TaxReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientName: "",
    type: "ESt" as TaxReturnType,
    year: new Date().getFullYear(),
    status: "draft" as TaxReturnStatus,
    dueDate: "",
    notes: "",
  });

  const loadReturns = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.tax.returns.list({ limit: 200 });
      const rows = (Array.isArray(pages) ? pages : []).map(pageToRow);
      rows.sort((a, b) => b.year - a.year || a.clientName.localeCompare(b.clientName));
      await setCache(OFFLINE_KEYS.taxReturns, rows);
      setReturns(rows);
    } catch (err) {
      const cached = await getCache<TaxReturnRow[]>(OFFLINE_KEYS.taxReturns);
      if (cached) {
        setReturns(cached);
        setLoadError(null);
      } else {
        setLoadError(err instanceof Error ? err.message : t("tax.returns.error_load"));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  const filtered = useMemo(() => {
    return returns.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.clientName.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      return true;
    });
  }, [returns, search, statusFilter, typeFilter]);

  async function createReturn() {
    if (!createForm.clientName.trim()) return;
    setCreateLoading(true);
    try {
      await api.tax.returns.create({
        clientName: createForm.clientName.trim(),
        type: createForm.type,
        year: createForm.year,
        status: createForm.status,
        dueDate: createForm.dueDate || undefined,
        notes: createForm.notes.trim() || undefined,
      });
      addToast({ type: "success", title: t("tax.returns.toast_created") });
      setCreateForm({
        clientName: "",
        type: "ESt",
        year: new Date().getFullYear(),
        status: "draft",
        dueDate: "",
        notes: "",
      });
      setCreateOpen(false);
      await loadReturns();
    } catch (err) {
      addToast({
        type: "error",
        title: t("tax.returns.toast_create_fail"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tax.returns.title")}
        description={t("tax.returns.desc")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("tax.returns.title") },
        ]}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="brand-bg gap-2 text-white">
            <Plus size={16} />
            {t("tax.returns.new")}
          </Button>
        }
      />

      {/* Search + Filters */}
      {!loading && returns.length > 0 && (
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
              placeholder={t("tax.returns.search")}
              aria-label={t("tax.returns.search")}
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
            onChange={(e) => setTypeFilter(e.target.value as TaxReturnType | "all")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="all">{t("tax.returns.all_types")}</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaxReturnStatus | "all")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="all">{t("tax.returns.all_status")}</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
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
            onClick={() => void loadReturns()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} />
            {t("tax.returns.retry")}
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
      ) : returns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText size={48} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-4 text-sm text-[color:var(--ds-text-subtle)]">
            {t("tax.returns.empty_title")}
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("tax.returns.empty_hint")}
          </p>
          <Button onClick={() => setCreateOpen(true)} className="brand-bg mt-4 gap-2 text-white">
            <Plus size={16} />
            {t("tax.returns.new")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search size={36} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-3 text-sm text-[color:var(--ds-text-subtle)]">
            {t("tax.returns.empty_filtered")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  <th className="px-5 py-3 font-medium">{t("tax.returns.col_client")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.returns.col_type")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.returns.col_year")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.returns.col_status")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.returns.col_due")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.returns.col_amount")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.slug}
                    onClick={() => router.push(`/dashboard/tax-returns/${encodeSlugPath(r.slug)}`)}
                    className="cursor-pointer border-b border-[color:var(--ds-border)]/50 transition-colors last:border-0 hover:bg-[color:var(--ds-hover)]"
                  >
                    <td className="px-5 py-3 font-medium text-[color:var(--ds-text)]">
                      {r.clientName}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {TYPE_LABELS[r.type] ?? r.type}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">{r.year}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {r.dueDate ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {r.taxAmount != null
                        ? `${r.taxAmount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tax.returns.modal_title")}</DialogTitle>
            <DialogDescription>{t("tax.returns.modal_desc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.returns.label_client")} *
              </label>
              <Input
                value={createForm.clientName}
                onChange={(e) => setCreateForm((p) => ({ ...p, clientName: e.target.value }))}
                placeholder={t("tax.returns.label_client")}
                autoFocus
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.returns.label_type")}
                </label>
                <select
                  value={createForm.type}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, type: e.target.value as TaxReturnType }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.returns.label_year")}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.returns.label_status")}
                </label>
                <select
                  value={createForm.status}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, status: e.target.value as TaxReturnStatus }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.returns.label_due")}
                </label>
                <Input
                  type="date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm((p) => ({ ...p, dueDate: e.target.value }))}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.returns.label_notes")}
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
              {t("tax.returns.btn_cancel")}
            </Button>
            <Button
              type="button"
              disabled={createLoading || !createForm.clientName.trim()}
              onClick={() => void createReturn()}
              className="brand-bg gap-2 text-white"
            >
              {createLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {createLoading ? t("tax.returns.btn_creating") : t("tax.returns.btn_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
