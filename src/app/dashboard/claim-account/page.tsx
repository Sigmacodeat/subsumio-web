"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Gavel, Euro, FileText, Landmark, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import {
  getClaimStatusLabel,
  isInstallmentPlanDefaulted,
  type AntragsDaten,
  type Claim,
  type ClaimJurisdiction,
  type ZvMeasure,
} from "@/lib/claim-account";
import { CaseSelect } from "@/components/legal/case-select";
import { VerzugszinsenCalculator } from "@/components/legal/VerzugszinsenCalculator";
import { csrfFetch } from "@/lib/csrf";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  mahnbescheid: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  vollstreckungsbescheid: "bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  zwangsvollstreckung: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  paid: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  written_off: "bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
};

function fmtEUR(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function ClaimAccountPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const me = useMe();
  const userJur: ClaimJurisdiction =
    (me.data?.user as { jurisdiction?: string } | undefined)?.jurisdiction === "at" ? "at" : "de";
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payingClaim, setPayingClaim] = useState<Claim | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [mahnClaim, setMahnClaim] = useState<Claim | null>(null);
  const [planClaim, setPlanClaim] = useState<Claim | null>(null);
  const [zvClaim, setZvClaim] = useState<Claim | null>(null);
  const [antragClaim, setAntragClaim] = useState<Claim | null>(null);
  const [gerichtInput, setGerichtInput] = useState("");
  const [titelInput, setTitelInput] = useState("");
  const [zvForm, setZvForm] = useState<{ type: ZvMeasure["type"]; target: string; costs: string }>({
    type: "pfändung_forderungen",
    target: "",
    costs: "",
  });
  const [planForm, setPlanForm] = useState({ count: "6", start: "", graceDays: "14" });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [form, setForm] = useState({
    case_slug: "",
    claimant_name: "",
    debtor_name: "",
    debtor_address: "",
    principal_amount: "",
    interest_amount: "",
    costs_amount: "",
    interest_from: "",
    due_date: "",
    court: "",
    claim_number: "",
  });

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listAllPages({ type: "claim_account", max: 200 });
      setClaims(pages.map((p) => p.frontmatter as unknown as Claim));
    } catch {
      addToast({ type: "error", title: t("claim.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (
      !form.case_slug ||
      !form.claimant_name ||
      !form.debtor_name ||
      !form.principal_amount ||
      !form.interest_from ||
      !form.due_date
    ) {
      addToast({ type: "error", title: t("claim.err_required") });
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/claim-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: form.case_slug,
          claimant_name: form.claimant_name,
          debtor_name: form.debtor_name,
          debtor_address: form.debtor_address || undefined,
          principal_amount: Number(form.principal_amount),
          interest_amount: form.interest_amount ? Number(form.interest_amount) : undefined,
          costs_amount: form.costs_amount ? Number(form.costs_amount) : undefined,
          interest_from: form.interest_from,
          due_date: form.due_date,
          court: form.court || undefined,
          claim_number: form.claim_number || undefined,
        }),
      });
      if (!res.ok) throw new Error("API error");
      addToast({ type: "success", title: t("claim.ok_create") });
      setShowCreate(false);
      setForm({
        case_slug: "",
        claimant_name: "",
        debtor_name: "",
        debtor_address: "",
        principal_amount: "",
        interest_amount: "",
        costs_amount: "",
        interest_from: "",
        due_date: "",
        court: "",
        claim_number: "",
      });
      void load();
    } catch {
      addToast({ type: "error", title: t("claim.err_create") });
    } finally {
      setSaving(false);
    }
  };

  const recordPayment = async () => {
    if (!payingClaim || !paymentAmount) return;
    try {
      const res = await csrfFetch("/api/claim-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: payingClaim, payment_amount: Number(paymentAmount) }),
      });
      if (!res.ok) throw new Error("API error");
      addToast({ type: "success", title: t("claim.ok_payment") });
      setPayingClaim(null);
      setPaymentAmount("");
      void load();
    } catch {
      addToast({ type: "error", title: t("claim.err_payment") });
    }
  };

  const patchClaim = async (
    claim: Claim,
    payload: Record<string, unknown>,
    busyKey: string
  ): Promise<{ antrag?: AntragsDaten } | null> => {
    setBusyAction(busyKey);
    try {
      const res = await csrfFetch("/api/claim-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim, jurisdiction: jurOf(claim), ...payload }),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok || !data?.ok) throw new Error("API error");
      void load();
      return data.data ?? {};
    } catch {
      addToast({ type: "error", title: t("claim.err_action") });
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  const jurOf = (claim: Claim): ClaimJurisdiction => claim.jurisdiction ?? userJur;

  const prepareMahnklage = async () => {
    if (!mahnClaim || !gerichtInput.trim()) return;
    const r = await patchClaim(
      mahnClaim,
      { action: "mahnklage", gericht: gerichtInput.trim() },
      "mahnklage"
    );
    if (r) {
      addToast({ type: "success", title: t("claim.ok_mahn") });
      setMahnClaim(null);
      setGerichtInput("");
      setAntragClaim({ ...mahnClaim, last_antrag: r.antrag } as Claim);
    }
  };

  const toVollstreckung = async (claim: Claim) => {
    const r = await patchClaim(claim, { action: "vollstreckung" }, `vs-${claim.id}`);
    if (r) addToast({ type: "success", title: t("claim.ok_vollstreckung") });
  };

  const prepareExekution = async () => {
    if (!zvClaim || !gerichtInput.trim() || !titelInput.trim() || !zvForm.target.trim()) return;
    const r = await patchClaim(
      zvClaim,
      {
        action: "exekution",
        gericht: gerichtInput.trim(),
        titel: titelInput.trim(),
        measure: {
          type: zvForm.type,
          target: zvForm.target.trim(),
          costs: zvForm.costs ? Number(zvForm.costs) : undefined,
        },
      },
      "exekution"
    );
    if (r) {
      addToast({ type: "success", title: t("claim.ok_exekution") });
      setZvClaim(null);
      setGerichtInput("");
      setTitelInput("");
      setAntragClaim({ ...zvClaim, last_antrag: r.antrag } as Claim);
    }
  };

  const createPlan = async () => {
    if (!planClaim || !planForm.start) return;
    const r = await patchClaim(
      planClaim,
      {
        action: "ratenplan",
        installments: Number(planForm.count),
        start_iso: planForm.start,
        grace_days: Number(planForm.graceDays) || 14,
      },
      "ratenplan"
    );
    if (r) {
      addToast({ type: "success", title: t("claim.ok_plan") });
      setPlanClaim(null);
      setPlanForm({ count: "6", start: "", graceDays: "14" });
    }
  };

  const recordInstallment = async () => {
    if (!payingClaim || !paymentAmount) return;
    const r = await patchClaim(
      payingClaim,
      { action: "rate", payment_amount: Number(paymentAmount) },
      "rate"
    );
    if (r) {
      addToast({ type: "success", title: t("claim.ok_payment") });
      setPayingClaim(null);
      setPaymentAmount("");
    }
  };

  const totalOpen = claims.reduce((sum, c) => sum + c.open_amount, 0);

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("claim.title")}
        description={t("claim.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("claim.title") },
        ]}
        actions={
          <PrimaryAction onClick={() => setShowCreate(!showCreate)}>{t("claim.new")}</PrimaryAction>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("claim.open_claims")}</p>
          <p className="text-2xl font-bold">{fmtEUR(totalOpen)}</p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("claim.active_cases")}</p>
          <p className="text-2xl font-bold">
            {claims.filter((c) => c.status !== "paid" && c.status !== "written_off").length}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("claim.paid")}</p>
          <p className="text-2xl font-bold">{claims.filter((c) => c.status === "paid").length}</p>
        </div>
      </div>

      {showCreate && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="font-semibold">{t("claim.create_title")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="claim-case">{t("claim.case_slug")} *</Label>
              <CaseSelect
                id="claim-case"
                value={form.case_slug}
                onChange={(case_slug) => setForm({ ...form, case_slug })}
              />
            </div>
            <div>
              <Label>{t("claim.claim_number")}</Label>
              <Input
                value={form.claim_number}
                onChange={(e) => setForm({ ...form, claim_number: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.claimant")} *</Label>
              <Input
                value={form.claimant_name}
                onChange={(e) => setForm({ ...form, claimant_name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.debtor")} *</Label>
              <Input
                value={form.debtor_name}
                onChange={(e) => setForm({ ...form, debtor_name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t("claim.debtor_address")}</Label>
              <Input
                value={form.debtor_address}
                onChange={(e) => setForm({ ...form, debtor_address: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.principal")} *</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.principal_amount}
                onChange={(e) => setForm({ ...form, principal_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.interest")}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.interest_amount}
                onChange={(e) => setForm({ ...form, interest_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.costs")}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.costs_amount}
                onChange={(e) => setForm({ ...form, costs_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.interest_from")} *</Label>
              <Input
                type="date"
                value={form.interest_from}
                onChange={(e) => setForm({ ...form, interest_from: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.due_date")} *</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.court")}</Label>
              <Input
                value={form.court}
                onChange={(e) => setForm({ ...form, court: e.target.value })}
              />
            </div>
            <VerzugszinsenCalculator
              principal={form.principal_amount}
              defaultVon={form.due_date}
              onApply={(interest_amount, interest_from) =>
                setForm({ ...form, interest_amount: String(interest_amount), interest_from })
              }
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={create} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("claim.create_btn")}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {t("claim.cancel")}
            </Button>
          </div>
        </section>
      )}

      {payingClaim && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="font-semibold">
            {t("claim.payment_title")} — {payingClaim.debtor_name}
          </h2>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Offen: {fmtEUR(payingClaim.open_amount)} · {t("claim.payment_hint")}
          </p>
          <div>
            <Label>{t("claim.payment_amount")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={payingClaim.installment_plan ? recordInstallment : recordPayment}>
              {t("claim.record_btn")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPayingClaim(null);
                setPaymentAmount("");
              }}
            >
              {t("claim.cancel")}
            </Button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : claims.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <Gavel className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("claim.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{claim.debtor_name}</span>
                    <Badge className={STATUS_COLORS[claim.status] ?? ""}>
                      {getClaimStatusLabel(claim.status, jurOf(claim))}
                    </Badge>
                    {claim.jurisdiction && (
                      <Badge variant="default">{claim.jurisdiction.toUpperCase()}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
                    <span>{claim.case_slug}</span>
                    {claim.claim_number && <span>Akz: {claim.claim_number}</span>}
                    {claim.court && <span>Gericht: {claim.court}</span>}
                    <span>Fällig: {claim.due_date}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{fmtEUR(claim.open_amount)}</p>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("claim.total_claim")} {fmtEUR(claim.total_claim)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
                <div className="rounded bg-[color:var(--ds-surface-2)] p-2">
                  <Euro className="mr-1 inline h-3 w-3" />
                  {t("claim.principal_label")}: {fmtEUR(claim.principal_amount)}
                </div>
                <div className="rounded bg-[color:var(--ds-surface-2)] p-2">
                  {t("claim.interest_label")}: {fmtEUR(claim.interest_amount)}
                </div>
                <div className="rounded bg-[color:var(--ds-surface-2)] p-2">
                  {t("claim.costs_label")}: {fmtEUR(claim.costs_amount)}
                </div>
                <div className="rounded bg-[color:var(--ds-surface-2)] p-2">
                  {t("claim.paid_label")}: {fmtEUR(claim.paid_amount)}
                </div>
              </div>
              {claim.installment_plan && (
                <div className="mt-3 rounded-lg border border-[color:var(--ds-border)] p-3">
                  <p className="mb-2 text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {t("claim.plan_title")}
                    {isInstallmentPlanDefaulted(
                      claim.installment_plan,
                      new Date().toISOString().slice(0, 10)
                    ) && (
                      <span className="ml-2 text-[color:var(--ds-danger-text)]">
                        {t("claim.plan_defaulted")}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {claim.installment_plan.installments.map((inst) => (
                      <span
                        key={inst.index}
                        title={`${inst.due_date} — ${fmtEUR(inst.paid_amount)} / ${fmtEUR(inst.amount)}`}
                        className={`rounded px-2 py-0.5 text-[11px] tabular-nums ${
                          inst.status === "bezahlt"
                            ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                            : inst.status === "überfällig"
                              ? "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                              : inst.status === "teilbezahlt"
                                ? "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                                : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]"
                        }`}
                      >
                        {inst.index + 1}. {fmtEUR(inst.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {claim.status !== "paid" && claim.status !== "written_off" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPayingClaim(claim);
                      setPaymentAmount("");
                    }}
                  >
                    {claim.installment_plan ? t("claim.record_rate") : t("claim.record_payment")}
                  </Button>
                  {claim.status === "open" && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyAction !== null}
                        onClick={() => {
                          setMahnClaim(claim);
                          setGerichtInput(claim.court ?? "");
                        }}
                      >
                        <Landmark size={13} className="mr-1.5" aria-hidden />
                        {jurOf(claim) === "at"
                          ? t("claim.mahnklage_at")
                          : t("claim.mahnbescheid_de")}
                      </Button>
                      {!claim.installment_plan && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyAction !== null}
                          onClick={() => {
                            setPlanClaim(claim);
                            setPlanForm((f) => ({
                              ...f,
                              start: new Date().toISOString().slice(0, 10),
                            }));
                          }}
                        >
                          <CalendarClock size={13} className="mr-1.5" aria-hidden />
                          {t("claim.plan_new")}
                        </Button>
                      )}
                    </>
                  )}
                  {claim.status === "mahnbescheid" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyAction !== null}
                      onClick={() => void toVollstreckung(claim)}
                    >
                      {busyAction === `vs-${claim.id}` && (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden />
                      )}
                      {jurOf(claim) === "at"
                        ? t("claim.zahlungsbefehl_at")
                        : t("claim.vollstreckungsbescheid_de")}
                    </Button>
                  )}
                  {claim.status === "vollstreckungsbescheid" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyAction !== null}
                      onClick={() => {
                        setZvClaim(claim);
                        setGerichtInput(claim.court ?? "");
                      }}
                    >
                      <Gavel size={13} className="mr-1.5" aria-hidden />
                      {jurOf(claim) === "at" ? t("claim.exekution_at") : t("claim.zv_de")}
                    </Button>
                  )}
                  {claim.last_antrag && (
                    <Button size="sm" variant="ghost" onClick={() => setAntragClaim(claim)}>
                      <FileText size={13} className="mr-1.5" aria-hidden />
                      {t("claim.antrag_view")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mahnklage-/Mahnbescheid-Dialog */}
      <Dialog open={!!mahnClaim} onOpenChange={(o) => !o && setMahnClaim(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mahnClaim &&
                (jurOf(mahnClaim) === "at" ? t("claim.mahnklage_at") : t("claim.mahnbescheid_de"))}
            </DialogTitle>
          </DialogHeader>
          {mahnClaim && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {mahnClaim.debtor_name} — {fmtEUR(mahnClaim.open_amount)}
              </p>
              <div>
                <Label htmlFor="mahn-gericht">{t("claim.gericht_label")}</Label>
                <Input
                  id="mahn-gericht"
                  value={gerichtInput}
                  onChange={(e) => setGerichtInput(e.target.value)}
                  placeholder={
                    jurOf(mahnClaim) === "at" ? "Bezirksgericht …" : "Zentrales Mahngericht …"
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMahnClaim(null)}>
              {t("claim.cancel")}
            </Button>
            <Button
              onClick={prepareMahnklage}
              disabled={!gerichtInput.trim() || busyAction === "mahnklage"}
            >
              {busyAction === "mahnklage" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {t("claim.antrag_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exekutions-Dialog */}
      <Dialog open={!!zvClaim} onOpenChange={(o) => !o && setZvClaim(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {zvClaim && (jurOf(zvClaim) === "at" ? t("claim.exekution_at") : t("claim.zv_de"))}
            </DialogTitle>
          </DialogHeader>
          {zvClaim && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="zv-titel">{t("claim.titel_label")}</Label>
                <Input
                  id="zv-titel"
                  value={titelInput}
                  onChange={(e) => setTitelInput(e.target.value)}
                  placeholder={
                    jurOf(zvClaim) === "at"
                      ? "z. B. Zahlungsbefehl BG X, Az …, rechtskräftig"
                      : "z. B. Vollstreckungsbescheid, Az …"
                  }
                />
              </div>
              <div>
                <Label htmlFor="zv-gericht">{t("claim.gericht_label")}</Label>
                <Input
                  id="zv-gericht"
                  value={gerichtInput}
                  onChange={(e) => setGerichtInput(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="zv-type">{t("claim.measure_label")}</Label>
                <select
                  id="zv-type"
                  value={zvForm.type}
                  onChange={(e) =>
                    setZvForm({ ...zvForm, type: e.target.value as ZvMeasure["type"] })
                  }
                  className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                >
                  {(
                    [
                      "pfändung_forderungen",
                      "pfändung_und_überweisung",
                      "pfändung_immobilien",
                      "zwangsversteigerung",
                      "zwangsverwaltung",
                      "eidesstattliche_versicherung",
                    ] as const
                  ).map((ty) => (
                    <option key={ty} value={ty}>
                      {ty}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="zv-target">{t("claim.target_label")}</Label>
                <Input
                  id="zv-target"
                  value={zvForm.target}
                  onChange={(e) => setZvForm({ ...zvForm, target: e.target.value })}
                  placeholder={
                    jurOf(zvClaim) === "at"
                      ? "z. B. Arbeitgeber X GmbH (Drittschuldner)"
                      : "z. B. Konto bei Bank Y, IBAN …"
                  }
                />
              </div>
              <div>
                <Label htmlFor="zv-costs">{t("claim.costs_label")} (€)</Label>
                <Input
                  id="zv-costs"
                  type="number"
                  inputMode="decimal"
                  value={zvForm.costs}
                  onChange={(e) => setZvForm({ ...zvForm, costs: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setZvClaim(null)}>
              {t("claim.cancel")}
            </Button>
            <Button
              onClick={prepareExekution}
              disabled={
                !gerichtInput.trim() ||
                !titelInput.trim() ||
                !zvForm.target.trim() ||
                busyAction === "exekution"
              }
            >
              {busyAction === "exekution" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {t("claim.antrag_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ratenplan-Dialog */}
      <Dialog open={!!planClaim} onOpenChange={(o) => !o && setPlanClaim(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("claim.plan_new")}</DialogTitle>
          </DialogHeader>
          {planClaim && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {planClaim.debtor_name} — {t("claim.plan_over")} {fmtEUR(planClaim.open_amount)}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="plan-count">{t("claim.plan_count")}</Label>
                  <Input
                    id="plan-count"
                    type="number"
                    min={2}
                    max={60}
                    value={planForm.count}
                    onChange={(e) => setPlanForm({ ...planForm, count: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="plan-start">{t("claim.plan_start")}</Label>
                  <Input
                    id="plan-start"
                    type="date"
                    value={planForm.start}
                    onChange={(e) => setPlanForm({ ...planForm, start: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="plan-grace">{t("claim.plan_grace")}</Label>
                  <Input
                    id="plan-grace"
                    type="number"
                    min={0}
                    max={90}
                    value={planForm.graceDays}
                    onChange={(e) => setPlanForm({ ...planForm, graceDays: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("claim.plan_hint")}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanClaim(null)}>
              {t("claim.cancel")}
            </Button>
            <Button onClick={createPlan} disabled={!planForm.start || busyAction === "ratenplan"}>
              {busyAction === "ratenplan" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {t("claim.plan_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Antragsdaten-View */}
      <Dialog open={!!antragClaim} onOpenChange={(o) => !o && setAntragClaim(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("claim.antrag_title")}</DialogTitle>
          </DialogHeader>
          {antragClaim?.last_antrag && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("claim.gericht_label")}
                  </p>
                  <p className="font-medium">{antragClaim.last_antrag.gericht}</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("claim.rechtsgrundlage")}
                  </p>
                  <p className="font-medium">{antragClaim.last_antrag.rechtsgrundlage}</p>
                </div>
              </div>
              <pre className="max-h-72 overflow-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4 font-mono text-xs whitespace-pre-wrap">
                {antragClaim.last_antrag.antragstext}
              </pre>
              <ul className="list-inside list-disc space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                {antragClaim.last_antrag.hinweise.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                const text = antragClaim?.last_antrag?.antragstext;
                if (text) void navigator.clipboard.writeText(text);
                addToast({ type: "success", title: t("claim.antrag_copied") });
              }}
            >
              {t("claim.antrag_copy")}
            </Button>
            <Button onClick={() => setAntragClaim(null)}>{t("claim.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
