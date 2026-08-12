"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, Wallet, AlertTriangle, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { FeeAgreement, BudgetStatus } from "@/lib/fee-agreements";
import { FEE_MODEL_LABELS, computeBudgetStatus } from "@/lib/fee-agreements";

const ALERT_COLORS: Record<string, string> = {
  none: "bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)]",
  warning: "bg-[color:var(--ds-warning-solid)] text-[color:var(--ds-warning-text)]",
  critical: "bg-[color:var(--ds-danger-solid)] text-[color:var(--ds-danger-text)]",
};

export default function FeeAgreementsPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [agreements, setAgreements] = useState<FeeAgreement[]>([]);
  const [loading, setLoading] = useState(true);
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
      const pages = await api.brain.listPages({ type: "fee_agreement", limit: 200 });
      setAgreements(pages.map((p) => p.frontmatter as unknown as FeeAgreement));
    } catch {
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
      const res = await fetch("/api/fee-agreements", {
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

  const computeStatus = (ag: FeeAgreement): BudgetStatus => {
    return computeBudgetStatus(ag, { minutes: 0, billedAmount: 0 });
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("fee.title")}
        description={t("fee.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("fee.title") },
        ]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("fee.new")}
          </Button>
        }
      />

      {showCreate && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="font-semibold">{t("fee.create_title")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{t("claim.case_slug")} *</Label>
              <Input
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
                placeholder="legal/cases/2026-001"
              />
            </div>
            <div>
              <Label>{t("fee.model")}</Label>
              <select
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2 text-sm"
                value={form.model}
                onChange={(e) =>
                  setForm({
                    ...form,
                    model: e.target.value as "rvg" | "hourly" | "flat" | "capped",
                  })
                }
              >
                <option value="rvg">RVG (Gesetzlich)</option>
                <option value="hourly">Stundensatz</option>
                <option value="flat">Pauschale</option>
                <option value="capped">Deckelung</option>
              </select>
            </div>
            <div>
              <Label>{t("fee.hourly_rate")}</Label>
              <Input
                type="number" inputMode="numeric"
                value={form.hourly_rate}
                onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                disabled={form.model !== "hourly" && form.model !== "capped"}
              />
            </div>
            <div>
              <Label>{t("fee.flat_amount")}</Label>
              <Input
                type="number" inputMode="numeric"
                value={form.flat_amount}
                onChange={(e) => setForm({ ...form, flat_amount: e.target.value })}
                disabled={form.model !== "flat"}
              />
            </div>
            <div>
              <Label>{t("fee.budget_cap")}</Label>
              <Input
                type="number" inputMode="numeric"
                value={form.budget_cap}
                onChange={(e) => setForm({ ...form, budget_cap: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("fee.rvg_area")}</Label>
              <Input
                value={form.rvg_area}
                onChange={(e) => setForm({ ...form, rvg_area: e.target.value })}
                placeholder="z.B. 1.3 RVG"
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t("fee.notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={create} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("fee.save")}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {t("fee.cancel")}
            </Button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : agreements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <Wallet className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("fee.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agreements.map((ag) => {
            const status = computeStatus(ag);
            return (
              <div
                key={ag.id}
                className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ag.case_slug}</span>
                    <Badge variant="default">{FEE_MODEL_LABELS[ag.model].de}</Badge>
                    {ag.budget_cap && (
                      <Badge className={ALERT_COLORS[status.alert_level]}>
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        {status.alert_level === "none"
                          ? "Im Budget"
                          : status.alert_level === "warning"
                            ? "80% erreicht"
                            : "Budget überschritten"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
                    {ag.hourly_rate && <span>Stundensatz: {ag.hourly_rate} €</span>}
                    {ag.flat_amount && <span>Pauschale: {ag.flat_amount} €</span>}
                    {ag.budget_cap && <span>Deckel: {ag.budget_cap} €</span>}
                    {ag.rvg_area && <span>RVG: {ag.rvg_area}</span>}
                  </div>
                </div>
                {ag.budget_cap && (
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
                      <span className="text-lg font-semibold">
                        {Math.round(status.utilization * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("fee.utilization")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
