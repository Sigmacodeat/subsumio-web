"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Trash2, Download, Loader2, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import {
  parseCaseOutcome,
  computeStats,
  exportAnalyticsCsv,
  OUTCOME_COLORS,
  type CaseOutcome,
  type OutcomeType,
  type CourtLevel,
  type ProcedureType,
} from "@/lib/litigation-analytics";
import type { BrainPage } from "@/lib/types";

type TFunc = (k: string) => string;

export default function LitigationAnalyticsPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const [outcomes, setOutcomes] = useState<CaseOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCourt, setFilterCourt] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterProcedure, setFilterProcedure] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pages = await api.legal.analytics.list({ limit: 500 });
      const parsed = (pages as BrainPage[])
        .map((p) => parseCaseOutcome(p.slug, p.frontmatter as Record<string, unknown>))
        .filter((o): o is CaseOutcome => o !== null);
      setOutcomes(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return outcomes.filter((o) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !o.caseTitle.toLowerCase().includes(q) &&
          !o.court.toLowerCase().includes(q) &&
          !o.judge?.toLowerCase().includes(q) &&
          !o.caseNumber?.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterCourt && o.court !== filterCourt) return false;
      if (filterOutcome && o.outcome !== filterOutcome) return false;
      if (filterProcedure && o.procedureType !== filterProcedure) return false;
      return true;
    });
  }, [outcomes, search, filterCourt, filterOutcome, filterProcedure]);

  const kpis = useMemo(() => computeStats(filtered), [filtered]);

  const courts = useMemo(() => [...new Set(outcomes.map((o) => o.court))].sort(), [outcomes]);

  const handleExport = useCallback(() => {
    const csv = exportAnalyticsCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `litigation-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const handleDelete = useCallback(
    async (slug: string) => {
      const ok = await confirm({
        title: t("analytics.delete_confirm"),
        message: "",
        confirmLabel: t("analytics.delete"),
        cancelLabel: t("analytics.cancel"),
        variant: "danger",
      });
      if (!ok) return;
      setDeleting(slug);
      try {
        await api.legal.analytics.delete(slug);
        setOutcomes((prev) => prev.filter((o) => o.slug !== slug));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
      setDeleting(null);
    },
    [confirm, t]
  );

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtDays = (n: number) => `${Math.round(n)}d`;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("analytics.title")}
        description={t("analytics.description")}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              <Download size={14} className="mr-1.5" />
              {t("analytics.export_csv")}
            </Button>
            <Button
              variant="glow"
              size="sm"
              onClick={() => setShowCreate(true)}
              className="brand-bg text-white"
            >
              <Plus size={14} className="mr-1.5" />
              {t("analytics.new")}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label={t("analytics.kpi_total")}
          value={String(kpis.totalCases)}
          color="text-[color:var(--ds-text)]"
        />
        <KpiCard
          label={t("analytics.kpi_winrate")}
          value={fmtPct(kpis.winRate)}
          color="text-emerald-600"
        />
        <KpiCard
          label={t("analytics.kpi_duration")}
          value={fmtDays(kpis.avgDurationDays)}
          color="text-blue-600"
        />
        <KpiCard
          label={t("analytics.kpi_hours")}
          value={kpis.avgLawyerHours ? kpis.avgLawyerHours.toFixed(1) : "—"}
          color="text-purple-600"
        />
        <KpiCard
          label={t("analytics.kpi_dispute")}
          value={kpis.totalAmountInDispute ? fmtCurrency(kpis.totalAmountInDispute) : "—"}
          color="text-amber-600"
        />
        <KpiCard
          label={t("analytics.kpi_awarded")}
          value={kpis.totalAmountAwarded ? fmtCurrency(kpis.totalAmountAwarded) : "—"}
          color="text-emerald-600"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Outcome Distribution */}
        <Card>
          <div className="border-b border-[color:var(--ds-border)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("analytics.outcome_distribution")}
            </h3>
          </div>
          <div className="p-4">
            <OutcomeBar distribution={kpis.outcomeDistribution} />
          </div>
        </Card>

        {/* Procedure Distribution */}
        <Card>
          <div className="border-b border-[color:var(--ds-border)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("analytics.procedure_distribution")}
            </h3>
          </div>
          <div className="p-4">
            <ProcedureBar distribution={kpis.procedureDistribution} />
          </div>
        </Card>
      </div>

      {/* Top Courts & Judges */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-[color:var(--ds-border)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("analytics.top_courts")}
            </h3>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)]">
            {kpis.topCourts.length === 0 ? (
              <p className="p-4 text-sm text-[color:var(--ds-text-muted)]">
                {t("analytics.empty")}
              </p>
            ) : (
              kpis.topCourts.map((c) => (
                <div key={c.court} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {c.court}
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {c.total} {t("analytics.kpi_total").toLowerCase()} · Ø{" "}
                      {fmtDays(c.avgDurationDays)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${c.winRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-emerald-600 tabular-nums">
                      {fmtPct(c.winRate)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-[color:var(--ds-border)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("analytics.top_judges")}
            </h3>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)]">
            {kpis.topJudges.length === 0 ? (
              <p className="p-4 text-sm text-[color:var(--ds-text-muted)]">
                {t("analytics.empty")}
              </p>
            ) : (
              kpis.topJudges.map((j) => (
                <div key={j.judge} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {j.judge}
                    </p>
                    <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                      {j.total} {t("analytics.kpi_total").toLowerCase()} · {j.courts.join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${j.winRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-blue-600 tabular-nums">
                      {fmtPct(j.winRate)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("analytics.search")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
        <select
          value={filterCourt}
          onChange={(e) => setFilterCourt(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
        >
          <option value="">{t("analytics.filter_court")}</option>
          {courts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterOutcome}
          onChange={(e) => setFilterOutcome(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
        >
          <option value="">{t("analytics.filter_outcome")}</option>
          {(["won", "lost", "settled", "partial", "withdrawn", "pending"] as OutcomeType[]).map(
            (o) => (
              <option key={o} value={o}>
                {t(`analytics.outcome_${o}`)}
              </option>
            )
          )}
        </select>
        <select
          value={filterProcedure}
          onChange={(e) => setFilterProcedure(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
        >
          <option value="">{t("analytics.filter_procedure")}</option>
          {(
            [
              "zivil",
              "straf",
              "verwaltungs",
              "finanz",
              "arbeits",
              "sozial",
              "familie",
            ] as ProcedureType[]
          ).map((p) => (
            <option key={p} value={p}>
              {t(`analytics.proc_${p}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-20 text-center">
          <Loader2 size={24} className="mx-auto animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-[color:var(--ds-text-muted)]">
          {t("analytics.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("analytics.case_title")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("analytics.court")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("analytics.judge")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("analytics.outcome")}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("analytics.amount_in_dispute")}
                </th>
                <th className="px-3 py-2 text-right font-medium">{t("analytics.duration")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ds-border)]">
              {filtered.map((o) => (
                <tr key={o.slug} className="hover:bg-[color:var(--ds-hover)]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-[color:var(--ds-text)]">{o.caseTitle}</div>
                    {o.caseNumber && (
                      <div className="text-xs text-[color:var(--ds-text-muted)]">
                        {o.caseNumber}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[color:var(--ds-text)]">{o.court}</td>
                  <td className="px-3 py-2 text-[color:var(--ds-text-muted)]">{o.judge ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${OUTCOME_COLORS[o.outcome]}20`,
                        color: OUTCOME_COLORS[o.outcome],
                      }}
                    >
                      {t(`analytics.outcome_${o.outcome}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[color:var(--ds-text)] tabular-nums">
                    {o.amountInDispute ? fmtCurrency(o.amountInDispute) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-[color:var(--ds-text-muted)] tabular-nums">
                    {o.durationDays ? `${o.durationDays}d` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleDelete(o.slug)}
                      disabled={deleting === o.slug}
                      className="text-[color:var(--ds-text-muted)] hover:text-red-500 disabled:opacity-50"
                    >
                      {deleting === o.slug ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateOutcomeModal
          t={t as unknown as TFunc}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          creating={creating}
          setCreating={setCreating}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{label}</p>
    </div>
  );
}

function OutcomeBar({ distribution }: { distribution: Record<OutcomeType, number> }) {
  const { t } = useLang();
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-sm text-[color:var(--ds-text-muted)]">—</p>;
  const entries = Object.entries(distribution) as [OutcomeType, number][];
  return (
    <div className="space-y-2">
      <div className="flex h-6 overflow-hidden rounded-lg">
        {entries
          .filter(([, v]) => v > 0)
          .map(([type, count]) => (
            <div
              key={type}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: OUTCOME_COLORS[type] }}
              title={`${t(`analytics.outcome_${type}`)}: ${count}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries
          .filter(([, v]) => v > 0)
          .map(([type, count]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: OUTCOME_COLORS[type] }}
              />
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                {t(`analytics.outcome_${type}`)} ({count})
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function ProcedureBar({ distribution }: { distribution: Record<ProcedureType, number> }) {
  const { t } = useLang();
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-sm text-[color:var(--ds-text-muted)]">—</p>;
  const entries = Object.entries(distribution) as [ProcedureType, number][];
  const colors: Record<ProcedureType, string> = {
    zivil: "#6366f1",
    straf: "#ef4444",
    verwaltungs: "#f59e0b",
    finanz: "#10b981",
    arbeits: "#8b5cf6",
    sozial: "#06b6d4",
    familie: "#ec4899",
  };
  return (
    <div className="space-y-2">
      <div className="flex h-6 overflow-hidden rounded-lg">
        {entries
          .filter(([, v]) => v > 0)
          .map(([type, count]) => (
            <div
              key={type}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: colors[type] }}
              title={`${t(`analytics.proc_${type}`)}: ${count}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries
          .filter(([, v]) => v > 0)
          .map(([type, count]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[type] }} />
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                {t(`analytics.proc_${type}`)} ({count})
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function CreateOutcomeModal({
  t,
  onClose,
  onCreated,
  creating,
  setCreating,
}: {
  t: TFunc;
  onClose: () => void;
  onCreated: () => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const [form, setForm] = useState({
    caseSlug: "",
    caseTitle: "",
    caseNumber: "",
    court: "",
    courtLevel: "" as CourtLevel | "",
    judge: "",
    procedureType: "zivil" as ProcedureType,
    outcome: "pending" as OutcomeType,
    amountInDispute: "",
    amountAwarded: "",
    startDate: "",
    endDate: "",
    lawyerHours: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.caseTitle || !form.court) return;
    setCreating(true);
    try {
      await api.legal.analytics.create({
        caseSlug: form.caseSlug || form.caseTitle.toLowerCase().replace(/\s+/g, "-"),
        caseTitle: form.caseTitle,
        caseNumber: form.caseNumber || undefined,
        court: form.court,
        courtLevel: form.courtLevel || undefined,
        judge: form.judge || undefined,
        procedureType: form.procedureType,
        outcome: form.outcome,
        amountInDispute: form.amountInDispute ? Number(form.amountInDispute) : undefined,
        amountAwarded: form.amountAwarded ? Number(form.amountAwarded) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        lawyerHours: form.lawyerHours ? Number(form.lawyerHours) : undefined,
        notes: form.notes || undefined,
      });
      onCreated();
    } catch {
      setCreating(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[color:var(--ds-text)]">
            {t("analytics.new")}
          </h3>
          <button
            onClick={onClose}
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.case_title")} *
              </label>
              <input
                value={form.caseTitle}
                onChange={(e) => setForm({ ...form, caseTitle: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.case_number")}
              </label>
              <input
                value={form.caseNumber}
                onChange={(e) => setForm({ ...form, caseNumber: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.court")} *
              </label>
              <input
                value={form.court}
                onChange={(e) => setForm({ ...form, court: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.court_level")}
              </label>
              <select
                value={form.courtLevel}
                onChange={(e) =>
                  setForm({ ...form, courtLevel: e.target.value as CourtLevel | "" })
                }
                className={inputClass}
              >
                <option value="">—</option>
                {(
                  [
                    "amtsgericht",
                    "landesgericht",
                    "oberlandesgericht",
                    "bundesgericht",
                    "verwaltungsgericht",
                    "finanzgericht",
                    "arbeitsgericht",
                    "sozialgericht",
                  ] as CourtLevel[]
                ).map((l) => (
                  <option key={l} value={l}>
                    {t(`analytics.court_${l}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.judge")}
              </label>
              <input
                value={form.judge}
                onChange={(e) => setForm({ ...form, judge: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.procedure_type")}
              </label>
              <select
                value={form.procedureType}
                onChange={(e) =>
                  setForm({ ...form, procedureType: e.target.value as ProcedureType })
                }
                className={inputClass}
              >
                {(
                  [
                    "zivil",
                    "straf",
                    "verwaltungs",
                    "finanz",
                    "arbeits",
                    "sozial",
                    "familie",
                  ] as ProcedureType[]
                ).map((p) => (
                  <option key={p} value={p}>
                    {t(`analytics.proc_${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.outcome")}
              </label>
              <select
                value={form.outcome}
                onChange={(e) => setForm({ ...form, outcome: e.target.value as OutcomeType })}
                className={inputClass}
              >
                {(
                  ["won", "lost", "settled", "partial", "withdrawn", "pending"] as OutcomeType[]
                ).map((o) => (
                  <option key={o} value={o}>
                    {t(`analytics.outcome_${o}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.lawyer_hours")}
              </label>
              <input
                type="number"
                step="0.1"
                value={form.lawyerHours}
                onChange={(e) => setForm({ ...form, lawyerHours: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.amount_in_dispute")}
              </label>
              <input
                type="number"
                step="0.01"
                value={form.amountInDispute}
                onChange={(e) => setForm({ ...form, amountInDispute: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.amount_awarded")}
              </label>
              <input
                type="number"
                step="0.01"
                value={form.amountAwarded}
                onChange={(e) => setForm({ ...form, amountAwarded: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.start_date")}
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("analytics.end_date")}
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("analytics.notes")}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} type="button">
              {t("analytics.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={creating || !form.caseTitle || !form.court}
              className="brand-bg text-white"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : t("analytics.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
