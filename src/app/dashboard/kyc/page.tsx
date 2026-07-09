"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { KYCVerification } from "@/lib/kyc";

export default function KYCPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const searchParams = useSearchParams();
  const [verifications, setVerifications] = useState<KYCVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    case_slug: searchParams.get("case_slug") ?? "",
    client_name: searchParams.get("client_name") ?? "",
    client_email: searchParams.get("client_email") ?? "",
    provider: "manual" as KYCVerification["provider"],
    is_pep: false,
    is_high_risk_country: false,
    cash_intensive: false,
    complex_ownership: false,
    trust_or_company_structure: false,
  });

  useEffect(() => {
    const caseSlug = searchParams.get("case_slug");
    const clientName = searchParams.get("client_name");
    if (caseSlug || clientName) {
      setForm((prev) => ({
        ...prev,
        case_slug: caseSlug ?? prev.case_slug,
        client_name: clientName ?? prev.client_name,
        client_email: searchParams.get("client_email") ?? prev.client_email,
      }));
      setShowCreate(true);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "kyc_verification", limit: 200 });
      setVerifications(pages.map((p) => p.frontmatter as unknown as KYCVerification));
    } catch {
      addToast({ type: "error", title: t("kyc.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!form.case_slug || !form.client_name) {
      addToast({ type: "error", title: "Pflichtfelder fehlen" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: form.case_slug,
          client_name: form.client_name,
          client_email: form.client_email || undefined,
          provider: form.provider,
          risk_assessment: {
            is_pep: form.is_pep,
            is_high_risk_country: form.is_high_risk_country,
            cash_intensive: form.cash_intensive,
            complex_ownership: form.complex_ownership,
            trust_or_company_structure: form.trust_or_company_structure,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: "KYC-Prüfung initiiert" });
      setShowCreate(false);
      setForm({
        case_slug: "",
        client_name: "",
        client_email: "",
        provider: "manual",
        is_pep: false,
        is_high_risk_country: false,
        cash_intensive: false,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      void load();
    } catch (e) {
      addToast({
        type: "error",
        title: "Fehler",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const highRiskCount = verifications.filter((v) => v.risk_level === "high").length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("kyc.title")}
        description={t("kyc.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("kyc.title") }]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)} className="brand-bg gap-2 text-white">
            <Plus size={16} /> KYC-Prüfung
          </Button>
        }
      />

      {highRiskCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]" />
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            <strong>{highRiskCount}</strong> Mandant(en) mit hohem Risiko — erweiterte
            Sorgfaltspflichten erforderlich.
          </p>
        </div>
      )}

      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="text-sm font-semibold">Neue KYC-Prüfung</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Akte *</Label>
              <Input
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Mandant *</Label>
              <Input
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">E-Mail</Label>
              <Input
                type="email"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Provider</Label>
              <select
                value={form.provider}
                onChange={(e) =>
                  setForm({ ...form, provider: e.target.value as KYCVerification["provider"] })
                }
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              >
                <option value="manual">Manuell</option>
                <option value="idnow">IDnow</option>
                <option value="video_ident">Video-Ident</option>
                <option value="post_ident">Post-Ident</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">Risikofaktoren</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ["is_pep", "PEP (politisch exponierte Person)"],
                  ["is_high_risk_country", "Hochrisikoland"],
                  ["cash_intensive", "Bargeldintensiv"],
                  ["complex_ownership", "Komplexe Eigentümerstruktur"],
                  ["trust_or_company_structure", "Trust/Gesellschaftsstruktur"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="rounded border-[color:var(--ds-border)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Prüfung starten
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : verifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <ShieldCheck size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium">Keine KYC-Prüfungen</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Starten Sie eine Identitätsprüfung für GwG-Konformität.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {verifications.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{v.client_name}</span>
                  <Badge
                    variant="default"
                    className={`text-xs ${v.risk_level === "high" ? "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]" : v.risk_level === "medium" ? "border-[color:var(--ds-attention-border)] text-[color:var(--ds-attention-text)]" : "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]"}`}
                  >
                    Risiko: {v.risk_level}
                  </Badge>
                  <Badge
                    variant="default"
                    className={`text-xs ${v.status === "verified" ? "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]" : v.status === "failed" ? "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]" : ""}`}
                  >
                    {v.status === "pending"
                      ? "Ausstehend"
                      : v.status === "in_progress"
                        ? "In Prüfung"
                        : v.status === "verified"
                          ? "Verifiziert"
                          : v.status === "failed"
                            ? "Fehlgeschlagen"
                            : "Abgelaufen"}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  Akte: {v.case_slug} · Provider: {v.provider}
                </div>
                {v.risk_factors.length > 0 && (
                  <div className="text-xs text-[color:var(--ds-attention-text)]">{v.risk_factors.join(", ")}</div>
                )}
                {v.transparenzregister_checked && (
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    Transparenzregister: geprüft
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
