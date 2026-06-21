"use client";

import { useState } from "react";
import { Radar, Loader2, AlertTriangle, CheckCircle2, Clock, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { CaseScannerResponse } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

export default function CaseScannerPage() {
  const { t } = useLang();
  const [lookAhead, setLookAhead] = useState(7);
  const [evidenceThreshold, setEvidenceThreshold] = useState(1);
  const [maxCases, setMaxCases] = useState(50);
  const [result, setResult] = useState<CaseScannerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.caseScan({
        look_ahead_days: lookAhead,
        evidence_threshold: evidenceThreshold,
        max_cases: maxCases,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scanner.error_start"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("scanner.title")}
        description={t("scanner.description")}
        breadcrumbs={[
          { label: t("nav.dashboard"), href: "/dashboard" },
          { label: t("scanner.title") },
        ]}
      />

      {/* Info banner */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <Radar size={18} className="mt-0.5 shrink-0 text-blue-600" />
          <div className="space-y-1 text-sm text-[color:var(--ds-text-muted)]">
            <p className="font-medium text-[color:var(--ds-text)]">{t("scanner.how_it_works")}</p>
            <p>{t("scanner.description_detail")}</p>
            <ul className="ml-2 list-inside list-disc space-y-0.5 text-xs">
              <li>{t("scanner.feature_deadlines")}</li>
              <li>{t("scanner.feature_issues")}</li>
              <li>{t("scanner.feature_evidence")}</li>
            </ul>
            <p className="text-xs">{t("scanner.result_note")}</p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
          <Settings2 size={14} /> {t("scanner.config")}
        </h3>

        {/* Look ahead */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("scanner.look_ahead")}
            </label>
            <span className="font-mono text-sm text-emerald-600">
              {lookAhead} {t("scanner.days")}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={90}
            value={lookAhead}
            onChange={(e) => setLookAhead(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("scanner.look_ahead_desc")}
          </p>
        </div>

        {/* Evidence threshold */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("scanner.evidence_threshold")}
            </label>
            <span className="font-mono text-sm text-emerald-600">{evidenceThreshold}</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            value={evidenceThreshold}
            onChange={(e) => setEvidenceThreshold(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("scanner.evidence_desc")}
          </p>
        </div>

        {/* Max cases */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[color:var(--ds-text)]">
            {t("scanner.max_cases")}
          </label>
          <select
            value={maxCases}
            onChange={(e) => setMaxCases(Number(e.target.value))}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
          >
            {[10, 25, 50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>
                {n} {t("scanner.cases")}
              </option>
            ))}
          </select>
        </div>

        <Button
          onClick={run}
          disabled={loading}
          className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />}
          {t("scanner.start")}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-600" />
            <div>
              <h3 className="text-sm font-medium text-[color:var(--ds-text)]">
                {t("scanner.started")}
              </h3>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("scanner.job_id")}: <span className="font-mono">{result.job_id}</span>
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
              <Clock size={16} className="mx-auto mb-1 text-emerald-600" />
              <div className="text-lg font-bold text-[color:var(--ds-text)]">
                {result.look_ahead_days}
              </div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">
                {t("scanner.days_preview")}
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
              <Radar size={16} className="mx-auto mb-1 text-emerald-600" />
              <div className="text-lg font-bold text-[color:var(--ds-text)]">
                {result.evidence_threshold}
              </div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">
                {t("scanner.evidence_threshold_short")}
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
              <Settings2 size={16} className="mx-auto mb-1 text-emerald-600" />
              <div className="text-lg font-bold text-[color:var(--ds-text)]">
                {result.max_cases}
              </div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">
                {t("scanner.max_cases_short")}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Badge
              variant="default"
              className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
            >
              <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {result.status}
            </Badge>
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {t("scanner.result_wait")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
