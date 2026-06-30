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
import type { TaxAuditPhase } from "@/lib/tax-types";
import {
  ClipboardCheck,
  Plus,
  Search,
  RotateCcw,
  Loader2,
  X,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type AuditType = "Betriebspruefung" | "Aussenpruefung" | "Lohnpruefung" | "UStpruefung";

const PHASE_LABELS: Record<TaxAuditPhase, string> = {
  vorbereitung: "Vorbereitung",
  pruefung: "Prüfung",
  abschluss: "Abschluss",
  rechtsbehelf: "Rechtsbehelf",
  abgeschlossen: "Abgeschlossen",
};

const PHASE_COLORS: Record<TaxAuditPhase, string> = {
  vorbereitung: "border-blue-500/20 bg-blue-500/10 text-blue-600",
  pruefung: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  abschluss: "border-violet-500/20 bg-violet-500/10 text-violet-600",
  rechtsbehelf: "border-orange-500/20 bg-orange-500/10 text-orange-600",
  abgeschlossen: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
};

const AUDIT_TYPES: Record<AuditType, string> = {
  Betriebspruefung: "Betriebsprüfung",
  Aussenpruefung: "Außenprüfung",
  Lohnpruefung: "Lohnprüfung",
  UStpruefung: "USt-Prüfung",
};

interface AuditRow {
  slug: string;
  clientName: string;
  type: AuditType;
  year: number;
  phase: TaxAuditPhase;
  auditor?: string;
  startDate?: string;
  endDate?: string;
  findings?: { issue: string; amount?: number; accepted: boolean }[];
  totalAdditionalTax?: number;
}

function pageToRow(page: BrainPage): AuditRow {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: page.slug,
    clientName: String(fm.client_name ?? "—"),
    type: (fm.audit_type as AuditType) ?? "Betriebspruefung",
    year: Number(fm.year ?? new Date().getFullYear()),
    phase: (fm.phase as TaxAuditPhase) ?? "vorbereitung",
    auditor: fm.auditor ? String(fm.auditor) : undefined,
    startDate: fm.start_date ? String(fm.start_date).slice(0, 10) : undefined,
    endDate: fm.end_date ? String(fm.end_date).slice(0, 10) : undefined,
    findings: Array.isArray(fm.findings) ? (fm.findings as AuditRow["findings"]) : undefined,
    totalAdditionalTax:
      typeof fm.total_additional_tax === "number" ? fm.total_additional_tax : undefined,
  };
}

export default function TaxAuditPage() {
  const router = useRouter();
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<TaxAuditPhase | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AuditType | "all">("all");
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientName: "",
    type: "Betriebspruefung" as AuditType,
    year: new Date().getFullYear(),
    phase: "vorbereitung" as TaxAuditPhase,
    auditor: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  const loadAudits = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.tax.audits.list({ limit: 200 });
      const rows = (Array.isArray(pages) ? pages : []).map(pageToRow);
      rows.sort((a, b) => b.year - a.year || a.clientName.localeCompare(b.clientName));
      await setCache(OFFLINE_KEYS.taxAudits, rows);
      setAudits(rows);
    } catch (err) {
      const cached = await getCache<AuditRow[]>(OFFLINE_KEYS.taxAudits);
      if (cached) {
        setAudits(cached);
        setLoadError(null);
      } else {
        setLoadError(err instanceof Error ? err.message : t("tax.audit.error_load"));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAudits();
  }, [loadAudits]);

  const filtered = useMemo(() => {
    return audits.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${a.clientName} ${a.auditor ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (phaseFilter !== "all" && a.phase !== phaseFilter) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      return true;
    });
  }, [audits, search, phaseFilter, typeFilter]);

  const activeCount = audits.filter((a) => a.phase !== "abgeschlossen").length;
  const totalFindings = audits.reduce((s, a) => s + (a.findings?.length ?? 0), 0);
  const totalAdditionalTax = audits.reduce((s, a) => s + (a.totalAdditionalTax ?? 0), 0);

  async function createAudit() {
    if (!createForm.clientName.trim()) return;
    setCreateLoading(true);
    try {
      await api.tax.audits.create({
        clientName: createForm.clientName.trim(),
        type: createForm.type,
        year: createForm.year,
        phase: createForm.phase,
        auditor: createForm.auditor.trim() || undefined,
        startDate: createForm.startDate || undefined,
        endDate: createForm.endDate || undefined,
        notes: createForm.notes.trim() || undefined,
      });
      addToast({ type: "success", title: t("tax.audit.toast_created") });
      setCreateForm({
        clientName: "",
        type: "Betriebspruefung",
        year: new Date().getFullYear(),
        phase: "vorbereitung",
        auditor: "",
        startDate: "",
        endDate: "",
        notes: "",
      });
      setCreateOpen(false);
      await loadAudits();
    } catch (err) {
      addToast({
        type: "error",
        title: t("tax.audit.toast_create_fail"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tax.audit.title")}
        description={t("tax.audit.desc")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("tax.audit.title") }]}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="brand-bg gap-2 text-white">
            <Plus size={16} />
            {t("tax.audit.new")}
          </Button>
        }
      />

      {/* Stats */}
      {!loading && audits.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("tax.audit.stat_total")}
            </div>
            <div className="text-xl font-bold text-[color:var(--ds-text)]">{audits.length}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("tax.audit.stat_active")}
            </div>
            <div className="text-xl font-bold text-amber-600">{activeCount}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("tax.audit.stat_findings")}
            </div>
            <div className="text-xl font-bold text-[color:var(--ds-text)]">{totalFindings}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("tax.audit.stat_additional_tax")}
            </div>
            <div className="text-xl font-bold text-rose-600">
              {totalAdditionalTax.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
            </div>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      {!loading && audits.length > 0 && (
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
              placeholder={t("tax.audit.search")}
              aria-label={t("tax.audit.search")}
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
            onChange={(e) => setTypeFilter(e.target.value as AuditType | "all")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="all">{t("tax.audit.all_types")}</option>
            {Object.entries(AUDIT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value as TaxAuditPhase | "all")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="all">{t("tax.audit.all_phases")}</option>
            {Object.entries(PHASE_LABELS).map(([k, v]) => (
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
            onClick={() => void loadAudits()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} />
            {t("tax.audit.retry")}
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
      ) : audits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardCheck size={48} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-4 text-sm text-[color:var(--ds-text-subtle)]">
            {t("tax.audit.empty_title")}
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("tax.audit.empty_hint")}
          </p>
          <Button onClick={() => setCreateOpen(true)} className="brand-bg mt-4 gap-2 text-white">
            <Plus size={16} />
            {t("tax.audit.new")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search size={36} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-3 text-sm text-[color:var(--ds-text-subtle)]">
            {t("tax.audit.empty_filtered")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  <th className="px-5 py-3 font-medium">{t("tax.audit.col_client")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.audit.label_type")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.audit.label_year")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.audit.label_auditor")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.audit.label_phase")}</th>
                  <th className="px-5 py-3 font-medium">{t("tax.audit.findings")}</th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("tax.audit.total_additional")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.slug}
                    onClick={() => router.push(`/dashboard/tax-audit/${encodeSlugPath(a.slug)}`)}
                    className="cursor-pointer border-b border-[color:var(--ds-border)]/50 transition-colors last:border-0 hover:bg-[color:var(--ds-hover)]"
                  >
                    <td className="px-5 py-3 font-medium text-[color:var(--ds-text)]">
                      {a.clientName}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {AUDIT_TYPES[a.type]}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">{a.year}</td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {a.auditor ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PHASE_COLORS[a.phase]}`}
                      >
                        {PHASE_LABELS[a.phase]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {a.findings && a.findings.length > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {a.findings.filter((f) => f.accepted).length}/{a.findings.length}
                          <CheckCircle size={12} className="text-emerald-500" />
                        </span>
                      ) : (
                        <span className="text-[color:var(--ds-text-subtle)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-[color:var(--ds-text)]">
                      {a.totalAdditionalTax != null
                        ? `${a.totalAdditionalTax.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`
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
            <DialogTitle>{t("tax.audit.modal_title")}</DialogTitle>
            <DialogDescription>{t("tax.audit.modal_desc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.audit.label_client")} *
              </label>
              <Input
                value={createForm.clientName}
                onChange={(e) => setCreateForm((p) => ({ ...p, clientName: e.target.value }))}
                placeholder={t("tax.audit.label_client")}
                autoFocus
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.audit.label_type")}
                </label>
                <select
                  value={createForm.type}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, type: e.target.value as AuditType }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {Object.entries(AUDIT_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.audit.label_year")}
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
                {t("tax.audit.label_auditor")}
              </label>
              <Input
                value={createForm.auditor}
                onChange={(e) => setCreateForm((p) => ({ ...p, auditor: e.target.value }))}
                placeholder={t("tax.audit.label_auditor")}
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.audit.label_phase")}
                </label>
                <select
                  value={createForm.phase}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, phase: e.target.value as TaxAuditPhase }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {Object.entries(PHASE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.audit.label_start")}
                </label>
                <Input
                  type="date"
                  value={createForm.startDate}
                  onChange={(e) => setCreateForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.audit.label_end")}
              </label>
              <Input
                type="date"
                value={createForm.endDate}
                onChange={(e) => setCreateForm((p) => ({ ...p, endDate: e.target.value }))}
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.audit.label_notes")}
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
              {t("tax.audit.btn_cancel")}
            </Button>
            <Button
              type="button"
              disabled={createLoading || !createForm.clientName.trim()}
              onClick={() => void createAudit()}
              className="brand-bg gap-2 text-white"
            >
              {createLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {createLoading ? t("tax.audit.btn_creating") : t("tax.audit.btn_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
