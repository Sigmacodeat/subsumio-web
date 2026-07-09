"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, Gavel, Euro } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { Claim } from "@/lib/claim-account";

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  mahnbescheid: "Mahnbescheid",
  vollstreckungsbescheid: "Vollstreckungsbescheid",
  zwangsvollstreckung: "Zwangsvollstreckung",
  paid: "Bezahlt",
  written_off: "Abgeschrieben",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-[color:var(--ds-info-solid)] text-[color:var(--ds-info-text)]",
  mahnbescheid: "bg-[color:var(--ds-warning-solid)] text-[color:var(--ds-warning-text)]",
  vollstreckungsbescheid: "bg-[color:var(--ds-attention-solid)] text-[color:var(--ds-attention-text)]",
  zwangsvollstreckung: "bg-[color:var(--ds-danger-solid)] text-[color:var(--ds-danger-text)]",
  paid: "bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)]",
  written_off: "bg-slate-100 text-slate-600",
};

function fmtEUR(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function ClaimAccountPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payingClaim, setPayingClaim] = useState<Claim | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
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
      const pages = await api.brain.listPages({ type: "claim_account", limit: 200 });
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
      const res = await fetch("/api/claim-account", {
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
      const res = await fetch("/api/claim-account", {
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

  const totalOpen = claims.reduce((sum, c) => sum + c.open_amount, 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("claim.title")}
        description={t("claim.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("claim.title") }]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("claim.new")}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
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
              <Label>{t("claim.case_slug")} *</Label>
              <Input
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
                placeholder="legal/cases/2026-001"
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
                value={form.principal_amount}
                onChange={(e) => setForm({ ...form, principal_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.interest")}</Label>
              <Input
                type="number"
                value={form.interest_amount}
                onChange={(e) => setForm({ ...form, interest_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("claim.costs")}</Label>
              <Input
                type="number"
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
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={recordPayment}>{t("claim.record_btn")}</Button>
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
        <div className="flex items-center justify-center py-12">
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
                      {STATUS_LABELS[claim.status] ?? claim.status}
                    </Badge>
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
              {claim.status !== "paid" && claim.status !== "written_off" && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPayingClaim(claim);
                      setPaymentAmount("");
                    }}
                  >
                    {t("claim.record_payment")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
