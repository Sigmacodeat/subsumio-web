"use client";

// grounding-exempt: this page only previews and starts the scan and shows run states; the AI findings are shown (with grounding) where they are reviewed (review inbox).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Loader2,
  Radar,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  CASE_SCAN_FAILED_STATES,
  CASE_SCAN_MAX_CASES,
  type CaseScanPreview,
  type CaseScanScope,
  type CaseScanStartResult,
} from "@/lib/legal/case-scan";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

const REVIEW_HREF = "/dashboard/communications?view=review";
const TERMINAL_STATES = new Set(["completed", ...CASE_SCAN_FAILED_STATES]);

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export default function CaseScannerPage() {
  const { t } = useLang();
  const [scope, setScope] = useState<CaseScanScope>("case");
  const [singleCase, setSingleCase] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [lookAhead, setLookAhead] = useState(7);
  const [evidenceThreshold, setEvidenceThreshold] = useState(1);
  const [preview, setPreview] = useState<CaseScanPreview | null>(null);
  const [result, setResult] = useState<CaseScanStartResult | null>(null);
  const [loading, setLoading] = useState<"preview" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const casesQuery = useQuery({
    queryKey: ["case-scanner", "cases"],
    queryFn: () => api.cases.list(),
    enabled: scope !== "all_open",
    staleTime: 60_000,
  });
  const cases = useMemo(
    () =>
      (casesQuery.data ?? [])
        .map((c) => ({ slug: c.slug, title: c.title || c.slug }))
        .sort((a, b) => a.title.localeCompare(b.title, "de")),
    [casesQuery.data]
  );
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? cases.filter((c) => c.title.toLowerCase().includes(q)) : cases;
  }, [cases, filter]);

  const statusQuery = useQuery({
    queryKey: ["case-scanner", "status", result?.scan_id],
    queryFn: () => api.legal.caseScanStatus(result!.scan_id),
    enabled: Boolean(result?.scan_id) && (result?.launched.length ?? 0) > 0,
    refetchInterval: (q) => {
      const runs = q.state.data?.runs;
      return runs && runs.length > 0 && runs.every((r) => TERMINAL_STATES.has(r.status))
        ? false
        : 15_000;
    },
  });

  const request = () => ({
    scope,
    ...(scope === "case" ? { case_slugs: [singleCase] } : {}),
    ...(scope === "selection" ? { case_slugs: selected } : {}),
    look_ahead_days: lookAhead,
    evidence_threshold: evidenceThreshold,
  });
  const canPreview =
    scope === "all_open" ||
    (scope === "case" && singleCase !== "") ||
    (scope === "selection" && selected.length > 0);

  // Any change to the request invalidates a shown preview (its price).
  function changed<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPreview(null);
      setResult(null);
      setError(null);
    };
  }

  async function runPreview() {
    setLoading("preview");
    setError(null);
    setResult(null);
    try {
      setPreview(await api.legal.caseScanPreview(request()));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scanner.error_start"));
    } finally {
      setLoading(null);
    }
  }

  async function start() {
    if (!preview) return;
    setLoading("start");
    setError(null);
    try {
      setResult(
        await api.legal.caseScanStart({ ...request(), expected_credits: preview.total_credits })
      );
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scanner.error_start"));
    } finally {
      setLoading(null);
    }
  }

  function toggle(slug: string) {
    changed(setSelected)(
      selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : selected.length >= CASE_SCAN_MAX_CASES
          ? selected
          : [...selected, slug]
    );
  }

  const runs = statusQuery.data?.runs ?? [];
  const titleOf = (slug: string) => cases.find((c) => c.slug === slug)?.title ?? slug;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("scanner.title")}
        description={t("scanner.description")}
        breadcrumbs={[
          { label: t("nav.dashboard"), href: "/dashboard" },
          { label: t("scanner.title") },
        ]}
      />

      {/* Info banner */}
      <div className="rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4">
        <div className="flex items-start gap-3">
          <Radar size={18} className="mt-0.5 shrink-0 text-[color:var(--ds-info-text)]" />
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

      {/* Scope + settings */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
          <Settings2 size={14} /> {t("scanner.config")}
        </h3>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-[color:var(--ds-text)]">
            {t("scanner.scope")}
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(["case", "selection", "all_open"] as const).map((s) => (
              <label
                key={s}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                  scope === s
                    ? "border-[color:var(--brand-primary)] text-[color:var(--ds-text)]"
                    : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]"
                )}
              >
                <input
                  type="radio"
                  name="scan-scope"
                  value={s}
                  checked={scope === s}
                  onChange={() => changed(setScope)(s)}
                />
                {t(`scanner.scope_${s}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {scope === "case" && (
          <div>
            <label
              htmlFor="scan-case"
              className="mb-1.5 block text-sm font-medium text-[color:var(--ds-text)]"
            >
              {t("scanner.pick_case")}
            </label>
            <select
              id="scan-case"
              value={singleCase}
              onChange={(e) => changed(setSingleCase)(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
            >
              <option value="">
                {casesQuery.isLoading ? t("scanner.cases_loading") : t("scanner.pick_placeholder")}
              </option>
              {cases.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === "selection" && (
          <div className="space-y-2">
            <input
              type="search"
              aria-label={t("scanner.filter_cases")}
              placeholder={t("scanner.filter_cases")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
            />
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {selected.length} {fill(t("scanner.selected"), { max: CASE_SCAN_MAX_CASES })}
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-[color:var(--ds-border)] p-2">
              {casesQuery.isLoading && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("scanner.cases_loading")}
                </p>
              )}
              {!casesQuery.isLoading && filtered.length === 0 && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">{t("scanner.no_cases")}</p>
              )}
              {filtered.map((c) => (
                <label key={c.slug} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.slug)}
                    disabled={!selected.includes(c.slug) && selected.length >= CASE_SCAN_MAX_CASES}
                    onChange={() => toggle(c.slug)}
                  />
                  <span className="truncate text-[color:var(--ds-text)]">{c.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Look ahead */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("scanner.look_ahead")}
            </label>
            <span className="font-mono text-sm text-[color:var(--ds-success-text)]">
              {lookAhead} {t("scanner.days")}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={90}
            aria-label={t("scanner.look_ahead")}
            value={lookAhead}
            onChange={(e) => changed(setLookAhead)(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {fill(t("scanner.look_ahead_desc"), { lookAhead })}
          </p>
        </div>

        {/* Evidence threshold */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("scanner.evidence_threshold")}
            </label>
            <span className="font-mono text-sm text-[color:var(--ds-success-text)]">
              {evidenceThreshold}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            aria-label={t("scanner.evidence_threshold")}
            value={evidenceThreshold}
            onChange={(e) => changed(setEvidenceThreshold)(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {fill(t("scanner.evidence_desc"), { evidenceThreshold })}
          </p>
        </div>

        <Button
          onClick={runPreview}
          disabled={!canPreview || loading !== null}
          variant="outline"
          className="w-full gap-2"
        >
          {loading === "preview" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Coins size={16} />
          )}
          {t("scanner.preview")}
        </Button>
      </div>

      {/* Cost preview + confirmation */}
      {preview && (
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h3 className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
            <Coins size={16} /> {t("scanner.preview_title")}
          </h3>
          {preview.count === 0 ? (
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("scanner.nothing_to_scan")}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                {fill(t("scanner.preview_line"), {
                  count: preview.count,
                  rate: preview.credits_per_case,
                  total: preview.total_credits,
                })}
              </p>
              {preview.balance !== null && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {fill(t("scanner.balance"), { balance: preview.balance })}
                </p>
              )}
              <ul className="max-h-40 list-inside list-disc overflow-y-auto overscroll-contain text-xs text-[color:var(--ds-text-muted)]">
                {preview.cases.map((c) => (
                  <li key={c.case_slug}>{c.title}</li>
                ))}
              </ul>
            </>
          )}
          {preview.truncated && (
            <p className="text-xs text-[color:var(--ds-warning-text)]">
              {fill(t("scanner.truncated"), { max: preview.max_cases })}
            </p>
          )}
          {preview.skipped.length > 0 && (
            <p className="text-xs text-[color:var(--ds-warning-text)]">
              {fill(t("scanner.skipped_count"), { count: preview.skipped.length })}
            </p>
          )}
          {preview.count > 0 && !preview.sufficient && (
            <p className="flex items-center gap-2 text-sm text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={14} /> {t("scanner.insufficient")}
            </p>
          )}
          {preview.count > 0 && preview.sufficient && (
            <Button
              onClick={start}
              disabled={loading !== null}
              className="w-full gap-2 bg-[color:var(--ds-success-solid-hover)] text-white hover:bg-[color:var(--signal-success-800)]"
            >
              {loading === "start" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Radar size={16} />
              )}
              {fill(t("scanner.confirm_start"), { total: preview.total_credits })}
            </Button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-[color:var(--ds-success-text)]" />
            <div>
              <h3 className="text-sm font-medium text-[color:var(--ds-text)]">
                {t("scanner.started")}
              </h3>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {fill(t("scanner.started_line"), {
                  launched: result.launched.length,
                  charged: result.charged_credits,
                })}
              </p>
              {result.refunded_credits > 0 && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {fill(t("scanner.refunded_line"), { refunded: result.refunded_credits })}
                </p>
              )}
            </div>
          </div>

          {[...result.failed, ...result.skipped].length > 0 && (
            <ul className="text-xs text-[color:var(--ds-warning-text)]">
              {[...result.failed, ...result.skipped].map((s) => (
                <li key={s.case_slug}>
                  {t("scanner.not_started")}: {titleOf(s.case_slug)}
                </li>
              ))}
            </ul>
          )}

          {runs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[color:var(--ds-text)]">
                {t("scanner.run_status")}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
                {runs.map((r) => (
                  <li key={r.job_id}>
                    {titleOf(r.case_slug)} —{" "}
                    {r.status === "completed"
                      ? t("scanner.run_done")
                      : CASE_SCAN_FAILED_STATES.has(r.status)
                        ? t("scanner.run_failed")
                        : t("scanner.run_running")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-[color:var(--ds-text-muted)]">
            <span>{t("scanner.result_wait")}</span>
            <Link
              href={REVIEW_HREF}
              className="inline-flex items-center gap-1 font-medium text-[color:var(--brand-primary)] hover:underline"
            >
              {t("scanner.to_review")} <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
