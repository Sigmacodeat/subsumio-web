"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Wallet } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton } from "@/components/dashboard/skeleton";
import { csrfFetch } from "@/lib/csrf";
import { caseFrontmatter, type TimeEntry } from "@/lib/legal-types";
import { encodeSlugPath, formatEur } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { FeeAgreement, BudgetStatus } from "@/lib/fee-agreements";
import {
  FEE_MODEL_LABELS,
  budgetInputsFromEntries,
  computeBudgetStatus,
} from "@/lib/fee-agreements";

const ALERT_COLORS: Record<string, string> = {
  none: "",
  warning:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  critical:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
};

interface CaseOption {
  slug: string;
  title: string;
  caseNumber?: string;
  timeEntries: TimeEntry[];
}

export default function FeeAgreementsPage() {
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const [agreements, setAgreements] = useState<FeeAgreement[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    case_slug: "",
    model: "rvg" as "rvg" | "hourly" | "flat" | "capped",
    hourly_rate: "",
    flat_amount: "",
    budget_cap: "",
    rvg_area: "",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      // Every agreement and matter (read in batches of 100): a matter beyond a
      // cut-off would show 0 % budget use.
      const batch = await api.brain.batchListPagesDetailed(["fee_agreement", "legal_case"], 10_000);
      if (batch.errors.length) throw new Error(`batch list failed: ${batch.errors.join(",")}`);
      setAgreements(
        (batch.results["fee_agreement"] ?? []).map((p) => p.frontmatter as unknown as FeeAgreement)
      );
      setCases(
        (batch.results["legal_case"] ?? []).map((p) => {
          const fm = caseFrontmatter(p);
          return {
            slug: p.slug,
            title: p.title,
            caseNumber: fm.case_number,
            timeEntries: fm.time_entries ?? [],
          };
        })
      );
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      addToast({ type: "error", title: t("fee.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!form.case_slug) {
      addToast({ type: "error", title: t("fee.err_slug") });
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/fee-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: form.case_slug,
          model: form.model,
          hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : undefined,
          flat_amount: form.flat_amount ? Number(form.flat_amount) : undefined,
          budget_cap: form.budget_cap ? Number(form.budget_cap) : undefined,
          rvg_area: form.rvg_area || undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("API error");
      addToast({ type: "success", title: t("fee.ok_create") });
      setShowCreate(false);
      setForm({
        case_slug: "",
        model: "rvg",
        hourly_rate: "",
        flat_amount: "",
        budget_cap: "",
        rvg_area: "",
        notes: "",
      });
      void load();
    } catch {
      addToast({ type: "error", title: t("fee.err_create") });
    } finally {
      setSaving(false);
    }
  };

  const caseFor = (slug: string) => cases.find((c) => c.slug === slug);
  const caseLabel = (slug: string) => {
    const c = caseFor(slug);
    if (!c) return slug.split("/").pop() ?? slug;
    return c.caseNumber ? `${c.caseNumber} – ${c.title}` : c.title;
  };

  /** Budget-Auslastung — dieselbe Regel wie das Budget-Widget. */
  const computeStatus = (ag: FeeAgreement): BudgetStatus => {
    const inputs = budgetInputsFromEntries(
      caseFor(ag.case_slug)?.timeEntries ?? [],
      ag.hourly_rate
    );
    return computeBudgetStatus(ag, {
      minutes: inputs.minutes,
      hourlyRate: ag.hourly_rate,
      trackedValue: inputs.trackedValue,
      billedAmount: inputs.billedAmount,
    });
  };

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("fee.title")}
        description={t("fee.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("fee.title") },
        ]}
        actions={
          <PrimaryAction onClick={() => setShowCreate(!showCreate)}>{t("fee.new")}</PrimaryAction>
        }
      />

      {showCreate && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("fee.create_title")}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fee-case">Akte *</Label>
              <select
                id="fee-case"
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2 text-sm"
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
              >
                <option value="">Akte auswählen</option>
                {cases.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.caseNumber ? `${c.caseNumber} – ${c.title}` : c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fee-model">{t("fee.model")}</Label>
              <select
                id="fee-model"
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2 text-sm"
                value={form.model}
                onChange={(e) =>
                  setForm({
                    ...form,
                    model: e.target.value as "rvg" | "hourly" | "flat" | "capped",
                  })
                }
              >
                <option value="rvg">Tarif (RATG/AHK)</option>
                <option value="hourly">Stundensatz</option>
                <option value="flat">Pauschale</option>
                <option value="capped">Deckelung</option>
              </select>
            </div>
            <div>
              <Label htmlFor="fee-rate">{t("fee.hourly_rate")}</Label>
              <Input
                id="fee-rate"
                type="number"
                inputMode="decimal"
                value={form.hourly_rate}
                onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                disabled={form.model !== "hourly" && form.model !== "capped"}
              />
            </div>
            <div>
              <Label htmlFor="fee-flat">{t("fee.flat_amount")}</Label>
              <Input
                id="fee-flat"
                type="number"
                inputMode="decimal"
                value={form.flat_amount}
                onChange={(e) => setForm({ ...form, flat_amount: e.target.value })}
                disabled={form.model !== "flat"}
              />
            </div>
            <div>
              <Label htmlFor="fee-cap">{t("fee.budget_cap")}</Label>
              <Input
                id="fee-cap"
                type="number"
                inputMode="decimal"
                value={form.budget_cap}
                onChange={(e) => setForm({ ...form, budget_cap: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="fee-area">{t("fee.rvg_area")}</Label>
              <Input
                id="fee-area"
                value={form.rvg_area}
                onChange={(e) => setForm({ ...form, rvg_area: e.target.value })}
                placeholder="z. B. TP 3A RATG"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="fee-notes">{t("fee.notes")}</Label>
              <Input
                id="fee-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={create} disabled={saving || !form.case_slug}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("fee.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              {t("fee.cancel")}
            </Button>
          </div>
        </section>
      )}

      {loading ? (
        <RowSkeleton count={3} />
      ) : loadFailed ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title={t("fee.err_load")}
            description="Die Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut."
            actionLabel={t("common.retry")}
            onAction={() => {
              setLoadFailed(false);
              setLoading(true);
              void load();
            }}
          />
        </div>
      ) : agreements.length === 0 ? (
        !showCreate && (
          <EmptyState
            icon={Wallet}
            title={t("fee.empty")}
            description="Hinterlegen Sie je Akte das vereinbarte Honorarmodell und optional ein Budget. Ab 80 % Auslastung erscheint eine Warnung."
            actionLabel={t("fee.new")}
            onAction={() => setShowCreate(true)}
          />
        )
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          {agreements.map((ag) => {
            const status = computeStatus(ag);
            const hasBudget = Boolean(status.budget_cap);
            return (
              <li key={ag.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/cases/${encodeSlugPath(ag.case_slug)}`}
                      className="truncate text-sm font-medium text-[color:var(--ds-text)] hover:underline"
                    >
                      {caseLabel(ag.case_slug)}
                    </Link>
                    <Badge variant="default" className="text-xs">
                      {FEE_MODEL_LABELS[ag.model]?.de ?? ag.model}
                    </Badge>
                    {hasBudget && status.alert_level !== "none" && (
                      <Badge className={`border text-xs ${ALERT_COLORS[status.alert_level]}`}>
                        {status.alert_level === "warning"
                          ? "80 % erreicht"
                          : "Budget überschritten"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                    {ag.hourly_rate ? (
                      <span>Stundensatz {formatEur(ag.hourly_rate, lang)}</span>
                    ) : null}
                    {ag.flat_amount ? (
                      <span>Pauschale {formatEur(ag.flat_amount, lang)}</span>
                    ) : null}
                    {ag.budget_cap ? <span>Budget {formatEur(ag.budget_cap, lang)}</span> : null}
                    {ag.rvg_area ? <span>Tarif {ag.rvg_area}</span> : null}
                  </div>
                </div>
                {hasBudget && (
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                      {Math.round(status.utilization * 100)} %
                    </div>
                    <p className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                      {formatEur(status.total_value, lang)} von{" "}
                      {formatEur(status.budget_cap ?? 0, lang)}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
