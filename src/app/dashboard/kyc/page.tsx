"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import type { BrainPage } from "@/lib/types";
import { missingForVerification, type KYCIdentification, type KYCVerification } from "@/lib/kyc";

const STATUS_LABEL: Record<KYCVerification["status"], string> = {
  pending: "Offen",
  in_progress: "In Bearbeitung",
  verified: "Abgeschlossen",
  failed: "Nicht bestanden",
  expired: "Abgelaufen",
};
const STATUS_VARIANT: Record<
  KYCVerification["status"],
  "default" | "warning" | "success" | "danger"
> = {
  pending: "warning",
  in_progress: "warning",
  verified: "success",
  failed: "danger",
  expired: "danger",
};
const RISK_LABEL = { low: "niedrig", medium: "mittel", high: "hoch" } as const;
const DOC_LABEL: Record<NonNullable<KYCIdentification["document_type"]>, string> = {
  reisepass: "Reisepass",
  personalausweis: "Personalausweis",
  fuehrerschein: "Führerschein",
  sonstiger_lichtbildausweis: "Sonstiger amtlicher Lichtbildausweis",
};
const RISK_FACTORS = [
  ["is_pep", "Politisch exponierte Person"],
  ["is_high_risk_country", "Bezug zu einem Hochrisikoland"],
  ["cash_intensive", "Bargeldintensives Geschäft"],
  ["complex_ownership", "Komplexe Eigentümerstruktur"],
  ["trust_or_company_structure", "Treuhand-, Stiftungs- oder Gesellschaftsstruktur"],
] as const;
type RiskKey = (typeof RISK_FACTORS)[number][0];

const fmtDate = (iso?: string) => formatDate(iso);
const selectClass =
  "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm";

async function send(url: string, method: string, body: unknown) {
  const res = await csrfFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: { verification?: KYCVerification; missing?: string[] };
    error?: string;
    message?: string;
    details?: { missing?: string[] };
    missing?: string[];
  } | null;
  if (!res.ok) {
    // Server messages for this route are German domain texts; never show a bare status code.
    const err = new Error(
      json?.message || "Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut."
    ) as Error & {
      missing?: string[];
    };
    err.missing = json?.details?.missing ?? json?.missing;
    throw err;
  }
  return json?.data ?? {};
}

export default function KYCPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<KYCVerification[]>([]);
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KYCVerification | null>(null);
  const [risk, setRisk] = useState<Record<RiskKey, boolean>>({
    is_pep: false,
    is_high_risk_country: false,
    cash_intensive: false,
    complex_ownership: false,
    trust_or_company_structure: false,
  });
  const [serverMissing, setServerMissing] = useState<string[]>([]);
  const [failReason, setFailReason] = useState("");
  const [uploadingId, setUploadingId] = useState(false);
  const [create, setCreate] = useState({
    case_slug: searchParams.get("case_slug") ?? "",
    client_name: searchParams.get("client_name") ?? "",
    client_email: searchParams.get("client_email") ?? "",
    party_type: "natural" as "natural" | "legal",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kyc", { cache: "no-store" });
      const json = (await res.json()) as { data?: { items?: KYCVerification[] } };
      setItems((json.data?.items ?? []).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    } catch {
      addToast({ type: "error", title: t("kyc.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
    api.brain
      .listAllPages({ type: "legal_case", max: 200 })
      .then(setCases)
      .catch(() => setCases([]));
  }, [load]);

  useEffect(() => {
    if (searchParams.get("case_slug") || searchParams.get("client_name")) setShowCreate(true);
  }, [searchParams]);

  const selected = useMemo(
    () => items.find((v) => v.id === selectedId) ?? null,
    [items, selectedId]
  );
  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : null);
    setServerMissing([]);
    setFailReason("");
    if (selected) {
      const f = selected.risk_factors ?? [];
      setRisk({
        is_pep: f.some((x) => x.startsWith("PEP")) || Boolean(selected.pep_match),
        is_high_risk_country: f.includes("Hochrisikoland"),
        cash_intensive: f.includes("Bargeldintensiv"),
        complex_ownership: f.includes("Komplexe Eigentümerstruktur"),
        trust_or_company_structure: f.includes("Trust/Gesellschaftsstruktur"),
      });
    }
  }, [selected]);

  const caseLabel = useCallback(
    (slug: string) => {
      const c = cases.find((x) => x.slug === slug);
      if (!c)
        return slug.startsWith("legal/intake") || slug.includes("intake")
          ? "Mandatsanfrage"
          : "Akte";
      const nr = caseFrontmatter(c).case_number;
      return nr ? `${nr} – ${c.title}` : c.title;
    },
    [cases]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!create.case_slug || !create.client_name.trim()) return;
    setSaving(true);
    try {
      const data = await send("/api/kyc", "POST", {
        case_slug: create.case_slug,
        client_name: create.client_name.trim(),
        client_email: create.client_email.trim() || undefined,
        party_type: create.party_type,
      });
      addToast({ type: "success", title: "Identitätsprüfung angelegt" });
      setShowCreate(false);
      await load();
      if (data.verification) setSelectedId(data.verification.id);
    } catch (err) {
      addToast({
        type: "error",
        title: "Anlegen fehlgeschlagen",
        description: (err as Error).message,
      });
    } finally {
      setSaving(false);
    }
  }

  const locked = draft?.status === "verified" || draft?.status === "failed";
  const setId = (patch: Partial<KYCIdentification>) =>
    draft && setDraft({ ...draft, identification: { ...draft.identification, ...patch } });

  async function uploadIdDocument(file: File | undefined) {
    if (!file || !draft?.case_slug) return;
    setUploadingId(true);
    try {
      const result = await api.upload.file(file, {
        title: `Lichtbildausweis — ${draft.client_name}`,
        case_slug: draft.case_slug,
        doc_type: "ausweiskopie",
        tags: ["kyc", "ausweis"],
      });
      setId({ document_file_slug: result.slug, copy_retained: true });
      addToast({ type: "success", title: "Ausweiskopie in der Akte abgelegt" });
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Upload fehlgeschlagen",
      });
    } finally {
      setUploadingId(false);
    }
  }

  async function saveDraft(): Promise<boolean> {
    if (!draft) return false;
    const data = await send(`/api/kyc/${encodeURIComponent(draft.id)}`, "PATCH", {
      action: "update",
      fields: {
        party_type: draft.party_type,
        client_email: draft.client_email || undefined,
        purpose: draft.purpose ?? "",
        identification: draft.identification ?? {},
        register_number: draft.register_number ?? "",
        wiereg_extract_obtained: Boolean(draft.wiereg_extract_obtained),
        wiereg_extract_date: draft.wiereg_extract_date ?? "",
        beneficial_owners: (draft.beneficial_owners ?? []).filter((o) => o.name.trim()),
        pep_check: Boolean(draft.pep_check),
        pep_match: Boolean(draft.pep_match),
        pep_note: draft.pep_note ?? "",
        sanctions_checked: Boolean(draft.sanctions_checked),
        sanctions_source: draft.sanctions_source ?? "",
        sanctions_hit: Boolean(draft.sanctions_hit),
        risk_assessment: risk,
        notes: draft.notes ?? "",
      },
    });
    setServerMissing(data.missing ?? []);
    await load();
    return true;
  }

  async function act(kind: "save" | "verify" | "fail" | "mandate_end" | "sanctions_check") {
    if (!draft) return;
    setSaving(true);
    try {
      if (kind === "save") {
        await saveDraft();
        addToast({ type: "success", title: "Gespeichert" });
      } else if (kind === "verify") {
        if (!locked) await saveDraft();
        await send(`/api/kyc/${encodeURIComponent(draft.id)}`, "PATCH", { action: "verify" });
        addToast({ type: "success", title: "Identitätsprüfung abgeschlossen" });
        await load();
      } else if (kind === "sanctions_check") {
        if (!locked) await saveDraft();
        const res = (await send(`/api/kyc/${encodeURIComponent(draft.id)}`, "PATCH", {
          action: "sanctions_check",
        })) as { data?: { verification?: KYCVerification } };
        const updated = res?.data?.verification;
        addToast(
          updated?.sanctions_hit
            ? {
                type: "error",
                title: "Treffer auf der Sanktionsliste",
                description:
                  "Bitte jeden Treffer prüfen. Ohne Klärung darf das Mandat nicht angenommen werden.",
              }
            : {
                type: "success",
                title: "Sanktionsabgleich ohne Treffer",
                description: updated?.sanctions_source,
              }
        );
        await load();
      } else if (kind === "fail") {
        await send(`/api/kyc/${encodeURIComponent(draft.id)}`, "PATCH", {
          action: "fail",
          reason: failReason,
        });
        addToast({ type: "success", title: "Als nicht bestanden erfasst" });
        await load();
      } else {
        await send(`/api/kyc/${encodeURIComponent(draft.id)}`, "PATCH", { action: "mandate_end" });
        addToast({ type: "success", title: "Mandatsende erfasst" });
        await load();
      }
    } catch (err) {
      const e = err as Error & { missing?: string[] };
      if (e.missing?.length) setServerMissing(e.missing);
      addToast({ type: "error", title: e.message });
    } finally {
      setSaving(false);
    }
  }

  const liveMissing = draft
    ? missingForVerification({ ...draft, pep_match: draft.pep_match || risk.is_pep })
    : [];
  const highRiskCount = items.filter(
    (v) => v.risk_level === "high" && v.status !== "failed"
  ).length;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("kyc.title")}
        description="Identifizierung und Risikoprüfung nach §§ 8a ff. RAO. Ohne abgeschlossene Prüfung wird ein Auftrag nicht angenommen."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("kyc.title") },
        ]}
        actions={
          <PrimaryAction onClick={() => setShowCreate((v) => !v)}>Identitätsprüfung</PrimaryAction>
        }
      />

      {highRiskCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]"
            aria-hidden
          />
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            {highRiskCount} {highRiskCount === 1 ? "Prüfung" : "Prüfungen"} mit hohem Risiko:
            verstärkte Sorgfaltspflichten beachten.
          </p>
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
        >
          <h2 className="text-sm font-semibold">Neue Identitätsprüfung</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="kyc-case" className="text-xs">
                Akte oder Mandatsanfrage *
              </Label>
              {create.case_slug && !cases.some((c) => c.slug === create.case_slug) ? (
                <Input id="kyc-case" value={caseLabel(create.case_slug)} readOnly />
              ) : (
                <select
                  id="kyc-case"
                  className={selectClass}
                  value={create.case_slug}
                  onChange={(e) => setCreate({ ...create, case_slug: e.target.value })}
                  required
                >
                  <option value="">Akte wählen</option>
                  {cases.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {caseLabel(c.slug)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="kyc-party" className="text-xs">
                Partei
              </Label>
              <select
                id="kyc-party"
                className={selectClass}
                value={create.party_type}
                onChange={(e) =>
                  setCreate({ ...create, party_type: e.target.value as "natural" | "legal" })
                }
              >
                <option value="natural">Natürliche Person</option>
                <option value="legal">Rechtsträger (Gesellschaft, Verein, Stiftung)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="kyc-name" className="text-xs">
                Name der Partei *
              </Label>
              <Input
                id="kyc-name"
                value={create.client_name}
                onChange={(e) => setCreate({ ...create, client_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kyc-email" className="text-xs">
                E-Mail
              </Label>
              <Input
                id="kyc-email"
                type="email"
                value={create.client_email}
                onChange={(e) => setCreate({ ...create, client_email: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <ShieldCheck size={14} aria-hidden />
            )}
            Anlegen
          </Button>
        </form>
      )}

      <div
        className={draft ? "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : "grid gap-6"}
      >
        <section aria-label="Prüfungen" className="space-y-2">
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Noch keine Identitätsprüfungen"
              description="Legen Sie für jede neue Partei eine Prüfung an, bevor Sie den Auftrag annehmen (§ 8b RAO)."
              actionLabel="Identitätsprüfung anlegen"
              onAction={() => setShowCreate(true)}
            />
          ) : (
            items.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                aria-current={v.id === selectedId ? "true" : undefined}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  v.id === selectedId
                    ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-surface-2)]"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-hover)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{v.client_name}</span>
                  <Badge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                  <Badge variant={v.risk_level === "high" ? "danger" : "default"}>
                    Risiko {RISK_LABEL[v.risk_level]}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  {caseLabel(v.case_slug)} · aktualisiert {fmtDate(v.updated_at)}
                  {v.retain_until ? ` · aufbewahren bis ${fmtDate(v.retain_until)}` : ""}
                </div>
              </button>
            ))
          )}
        </section>

        {draft && (
          <section
            aria-label={`Prüfung ${draft.client_name}`}
            className="space-y-5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{draft.client_name}</h2>
              <Badge variant={STATUS_VARIANT[draft.status]}>{STATUS_LABEL[draft.status]}</Badge>
            </div>
            {locked && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {draft.status === "verified"
                  ? `Abgeschlossen am ${fmtDate(draft.verified_at)} von ${draft.verified_by}. Die Angaben sind nicht mehr änderbar.`
                  : `Nicht bestanden: ${draft.failed_reason}`}
              </p>
            )}

            <fieldset disabled={locked || saving} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="kyc-purpose" className="text-xs">
                  Zweck und Art der Geschäftsbeziehung *
                </Label>
                <Textarea
                  id="kyc-purpose"
                  rows={2}
                  value={draft.purpose ?? ""}
                  onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  {draft.party_type === "legal"
                    ? "Vertretungsbefugte Person"
                    : "Amtlicher Lichtbildausweis"}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="kyc-method" className="text-xs">
                      Art der Identifizierung
                    </Label>
                    <select
                      id="kyc-method"
                      className={selectClass}
                      value={draft.identification?.method ?? "persoenlich"}
                      onChange={(e) =>
                        setId({ method: e.target.value as KYCIdentification["method"] })
                      }
                    >
                      <option value="persoenlich">Persönliche Vorlage</option>
                      <option value="elektronisch">Elektronisch (z. B. ID Austria)</option>
                      <option value="dritter">Durch Dritten</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kyc-doc-type" className="text-xs">
                      Dokument *
                    </Label>
                    <select
                      id="kyc-doc-type"
                      className={selectClass}
                      value={draft.identification?.document_type ?? ""}
                      onChange={(e) =>
                        setId({
                          document_type: (e.target.value ||
                            undefined) as KYCIdentification["document_type"],
                        })
                      }
                    >
                      <option value="">Bitte wählen</option>
                      {Object.entries(DOC_LABEL).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kyc-doc-number" className="text-xs">
                      Nummer *
                    </Label>
                    <Input
                      id="kyc-doc-number"
                      value={draft.identification?.document_number ?? ""}
                      onChange={(e) => setId({ document_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kyc-doc-authority" className="text-xs">
                      Ausstellende Behörde *
                    </Label>
                    <Input
                      id="kyc-doc-authority"
                      value={draft.identification?.issuing_authority ?? ""}
                      onChange={(e) => setId({ issuing_authority: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kyc-doc-valid" className="text-xs">
                      Gültig bis *
                    </Label>
                    <Input
                      id="kyc-doc-valid"
                      type="date"
                      value={draft.identification?.document_valid_until ?? ""}
                      onChange={(e) => setId({ document_valid_until: e.target.value || undefined })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kyc-birth-date" className="text-xs">
                      Geburtsdatum{draft.party_type === "legal" ? "" : " *"}
                    </Label>
                    <Input
                      id="kyc-birth-date"
                      type="date"
                      value={draft.identification?.birth_date ?? ""}
                      onChange={(e) => setId({ birth_date: e.target.value || undefined })}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="kyc-doc-file" className="text-xs">
                      Ausweiskopie (Scan/Foto)
                    </Label>
                    {draft.identification?.document_file_slug ? (
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="success" className="max-w-full truncate">
                          {draft.identification.document_file_slug}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={locked || uploadingId}
                          aria-label="Ausweiskopie entfernen"
                          onClick={() =>
                            setId({ document_file_slug: undefined, copy_retained: false })
                          }
                        >
                          <XCircle size={13} />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          id="kyc-doc-file"
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={locked || uploadingId || !draft.case_slug}
                          onChange={(e) => void uploadIdDocument(e.target.files?.[0])}
                          className="text-xs"
                        />
                        {uploadingId && <Loader2 size={14} className="animate-spin" aria-hidden />}
                      </div>
                    )}
                    <p className="text-[11px] text-[color:var(--ds-text-subtle)]">
                      Wird in der Akte abgelegt (§ 8b Abs. 5 RAO — Kopie aufbewahren).
                    </p>
                  </div>
                  <div className="flex flex-col justify-end gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.identification?.copy_retained)}
                        onChange={(e) => setId({ copy_retained: e.target.checked })}
                      />
                      Kopie aufbewahrt
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.identification?.remote)}
                        onChange={(e) => setId({ remote: e.target.checked })}
                      />
                      Partei nicht persönlich anwesend
                    </label>
                  </div>
                </div>
                {draft.identification?.remote && (
                  <div className="space-y-1">
                    <Label htmlFor="kyc-remote-measures" className="text-xs">
                      Zusätzliche Maßnahmen beim Ferngeschäft *
                    </Label>
                    <Textarea
                      id="kyc-remote-measures"
                      rows={2}
                      value={draft.identification?.additional_measures ?? ""}
                      onChange={(e) => setId({ additional_measures: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {draft.party_type === "legal" && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Rechtsträger und wirtschaftliche Eigentümer
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="kyc-register" className="text-xs">
                        Firmenbuchnummer
                      </Label>
                      <Input
                        id="kyc-register"
                        value={draft.register_number ?? ""}
                        onChange={(e) => setDraft({ ...draft, register_number: e.target.value })}
                        placeholder="FN 123456a"
                      />
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.wiereg_extract_obtained)}
                        onChange={(e) =>
                          setDraft({ ...draft, wiereg_extract_obtained: e.target.checked })
                        }
                      />
                      WiEReG-Auszug eingeholt *
                    </label>
                  </div>
                  {(draft.beneficial_owners?.length
                    ? draft.beneficial_owners
                    : [{ name: "", verified: false }]
                  ).map((o, i, arr) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={`kyc-owner-${i}`} className="sr-only">
                        Wirtschaftlicher Eigentümer {i + 1}
                      </Label>
                      <Input
                        id={`kyc-owner-${i}`}
                        className="min-w-0 flex-1"
                        placeholder="Name des wirtschaftlichen Eigentümers"
                        value={o.name}
                        onChange={(e) => {
                          const owners = [...arr];
                          owners[i] = { ...o, name: e.target.value };
                          setDraft({ ...draft, beneficial_owners: owners });
                        }}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={o.verified}
                          onChange={(e) => {
                            const owners = [...arr];
                            owners[i] = { ...o, verified: e.target.checked };
                            setDraft({ ...draft, beneficial_owners: owners });
                          }}
                        />
                        geprüft
                      </label>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        beneficial_owners: [
                          ...(draft.beneficial_owners ?? []),
                          { name: "", verified: false },
                        ],
                      })
                    }
                  >
                    Weiteren Eigentümer hinzufügen
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Risiko, PEP und Sanktionen</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {RISK_FACTORS.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={risk[key]}
                        onChange={(e) => {
                          setRisk({ ...risk, [key]: e.target.checked });
                          if (key === "is_pep") setDraft({ ...draft, pep_match: e.target.checked });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.pep_check)}
                    onChange={(e) => setDraft({ ...draft, pep_check: e.target.checked })}
                  />
                  PEP-Prüfung durchgeführt *
                </label>
                {(draft.pep_match || risk.is_pep) && (
                  <div className="space-y-1">
                    <Label htmlFor="kyc-pep-note" className="text-xs">
                      Verstärkte Sorgfalt: Herkunft der Mittel und Genehmigung *
                    </Label>
                    <Textarea
                      id="kyc-pep-note"
                      rows={2}
                      value={draft.pep_note ?? ""}
                      onChange={(e) => setDraft({ ...draft, pep_note: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.sanctions_checked)}
                      onChange={(e) => setDraft({ ...draft, sanctions_checked: e.target.checked })}
                    />
                    Sanktionslisten geprüft *
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.sanctions_hit)}
                      onChange={(e) => setDraft({ ...draft, sanctions_hit: e.target.checked })}
                    />
                    Treffer auf einer Sanktionsliste
                  </label>
                </div>
                <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      Abgleich mit der EU-Finanzsanktionsliste
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={saving || locked || !draft.client_name?.trim()}
                      onClick={() => void act("sanctions_check")}
                    >
                      {saving ? "Prüfe…" : "Jetzt abgleichen"}
                    </Button>
                  </div>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    Geprüft werden der Mandant und die wirtschaftlichen Eigentümer, mit
                    Schreibvarianten und Geburtsdatum. Das Ergebnis wird mit Listenstand
                    festgehalten.
                  </p>
                  {draft.sanctions_matches && draft.sanctions_matches.length > 0 && (
                    <ul className="space-y-1">
                      {draft.sanctions_matches.map((hit) => (
                        <li key={hit.name} className="text-xs text-[color:var(--ds-danger-text)]">
                          <strong>{hit.name}</strong>:{" "}
                          {hit.matches
                            .map(
                              (m) =>
                                `${m.primaryName} (${m.programmes.join(", ") || "ohne Programm"}, Übereinstimmung ${Math.round(m.score * 100)} %)`
                            )
                            .join("; ")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="kyc-sanctions-source" className="text-xs">
                    Geprüfte Liste und Datum *
                  </Label>
                  <Input
                    id="kyc-sanctions-source"
                    value={draft.sanctions_source ?? ""}
                    onChange={(e) => setDraft({ ...draft, sanctions_source: e.target.value })}
                    placeholder="wird vom Abgleich gefüllt"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="kyc-notes" className="text-xs">
                  Notizen
                </Label>
                <Textarea
                  id="kyc-notes"
                  rows={2}
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </div>
            </fieldset>

            {!locked && (serverMissing.length > 0 || liveMissing.length > 0) && (
              <div
                role="status"
                className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3 text-sm text-[color:var(--ds-warning-text)]"
              >
                <p className="font-medium">Für den Abschluss fehlt noch:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {(serverMissing.length > 0 ? serverMissing : liveMissing).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!locked && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void act("save")}
                  >
                    Speichern
                  </Button>
                  <Button
                    type="button"
                    className="brand-bg gap-2 text-white"
                    disabled={saving}
                    onClick={() => void act("verify")}
                  >
                    <CheckCircle2 size={14} aria-hidden /> Prüfung abschließen
                  </Button>
                </>
              )}
              {draft.status === "verified" && !draft.mandate_ended_at && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void act("mandate_end")}
                >
                  Mandat beendet
                </Button>
              )}
            </div>

            {!locked && (
              <div className="space-y-2 border-t border-[color:var(--ds-border)] pt-4">
                <Label htmlFor="kyc-fail-reason" className="text-xs">
                  Identifizierung nicht möglich? Grund (mind. 10 Zeichen)
                </Label>
                <Textarea
                  id="kyc-fail-reason"
                  rows={2}
                  value={failReason}
                  onChange={(e) => setFailReason(e.target.value)}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={saving || failReason.trim().length < 10}
                  onClick={() => void act("fail")}
                  className="gap-2"
                >
                  <XCircle size={14} aria-hidden /> Als nicht bestanden erfassen
                </Button>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Ohne vollständige Identifizierung darf der Auftrag nicht angenommen werden (§ 8b
                  Abs. 7 RAO).
                </p>
              </div>
            )}

            {draft.history && draft.history.length > 0 && (
              <div className="space-y-1 border-t border-[color:var(--ds-border)] pt-4">
                <h3 className="text-sm font-medium">Verlauf</h3>
                <ul className="space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {draft.history
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <li key={i}>
                        {formatDateTime(h.at)} · {h.by} ·{" "}
                        {
                          {
                            created: "angelegt",
                            updated: "bearbeitet",
                            verified: "abgeschlossen",
                            failed: "nicht bestanden",
                            mandate_ended: "Mandatsende erfasst",
                            reopened: "wieder geöffnet",
                          }[h.action]
                        }
                        {h.note ? ` — ${h.note}` : ""}
                      </li>
                    ))}
                </ul>
                {draft.retain_until && (
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    Aufbewahrung bis {fmtDate(draft.retain_until)} (§ 12 Abs. 3 RAO).
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
