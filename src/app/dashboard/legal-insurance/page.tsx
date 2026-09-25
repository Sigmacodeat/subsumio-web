"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton } from "@/components/dashboard/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { caseFrontmatter } from "@/lib/legal-types";
import type { RSVCaseData, CoverageResult } from "@/lib/legal-insurance";
import { formatDate } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

const COVERAGE_LABELS: Record<RSVCaseData["coverage_status"], string> = {
  not_inquired: "Nicht angefragt",
  pending: "Angefragt",
  approved: "Gedeckt",
  partially_approved: "Teilweise gedeckt",
  denied: "Abgelehnt",
  expired: "Abgelaufen",
};

const COVERAGE_TONE: Partial<Record<RSVCaseData["coverage_status"], string>> = {
  approved:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  partially_approved:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  denied:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
};

interface CaseOption {
  slug: string;
  label: string;
  clientName?: string;
}

const EMPTY_FORM = {
  case_slug: "",
  client_name: "",
  insurance_provider: "",
  insurance_number: "",
  matter: "",
  legal_area: "",
  dispute_value: "",
};

const FIELD =
  "h-11 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm text-[color:var(--ds-text)] sm:h-auto sm:py-2.5";

export default function LegalInsurancePage() {
  const { t } = useLang();
  const tr = (key: string) => t(key as DashboardKey);
  const [items, setItems] = useState<RSVCaseData[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch("/api/legal-insurance");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setItems(j.data?.items ?? []);
    } catch (err) {
      console.error("[rsv] load failed:", err instanceof Error ? err.message : err);
      setLoadError(
        "Die Deckungsanfragen konnten nicht geladen werden. Bitte laden Sie die Seite neu."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    api.brain
      .listAllPages({ type: "legal_case", max: 10_000 })
      .then((pages) =>
        setCases(
          pages.map((p) => {
            const fm = caseFrontmatter(p);
            return {
              slug: p.slug,
              label: fm.case_number ? `${fm.case_number} – ${p.title}` : p.title,
              clientName: fm.client_name,
            };
          })
        )
      )
      .catch(() => setCases([]));
  }, [load]);

  const caseLabel = (slug: string) =>
    cases.find((c) => c.slug === slug)?.label ?? slug.split("/").pop() ?? slug;

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await csrfFetch("/api/legal-insurance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          insurance_number: form.insurance_number || undefined,
          dispute_value: form.dispute_value ? Number(form.dispute_value) : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSubmitError("Die Anfrage wurde nicht erstellt. Bitte prüfen Sie die Pflichtfelder.");
        return;
      }
      const provider = j.data?.provider as
        | { mode: "api"; coverage: CoverageResult }
        | { mode: "email" }
        | undefined;
      setCoverage(provider?.mode === "api" ? provider.coverage : null);
      setEmail(provider?.mode === "api" ? null : (j.data?.inquiryEmail ?? null));
      setCopied(false);
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setSubmitError("Keine Verbindung zum Server. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(`${email.subject}\n\n${email.body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const canSubmit =
    form.case_slug && form.client_name && form.insurance_provider && form.matter && form.legal_area;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={tr("workspace.rsv.title")}
        description={tr("workspace.rsv.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: tr("workspace.rsv.title") },
        ]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {tr("workspace.rsv.new")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rsv-case">Akte *</Label>
            <select
              id="rsv-case"
              className={FIELD}
              value={form.case_slug}
              onChange={(e) => {
                const c = cases.find((x) => x.slug === e.target.value);
                setForm({
                  ...form,
                  case_slug: e.target.value,
                  client_name: form.client_name || c?.clientName || "",
                });
              }}
            >
              <option value="">Akte auswählen</option>
              {cases.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ["client_name", tr("workspace.rsv.client"), true],
              ["insurance_provider", tr("workspace.rsv.insurer"), true],
              ["insurance_number", tr("workspace.rsv.number"), false],
              ["legal_area", tr("workspace.rsv.area"), true],
            ] as const
          ).map(([key, label, required]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`rsv-${key}`}>
                {label}
                {required ? " *" : ""}
              </Label>
              <Input
                id={`rsv-${key}`}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="rsv-dispute_value">{tr("workspace.rsv.value")} (€)</Label>
            <Input
              id="rsv-dispute_value"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={form.dispute_value}
              onChange={(e) => setForm({ ...form, dispute_value: e.target.value })}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="rsv-matter">{tr("workspace.rsv.matter")} *</Label>
            <textarea
              id="rsv-matter"
              className={`${FIELD} min-h-24`}
              value={form.matter}
              onChange={(e) => setForm({ ...form, matter: e.target.value })}
            />
          </div>
        </div>
        {submitError && (
          <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
            {submitError}
          </p>
        )}
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={!canSubmit || submitting}
          loading={submitting}
        >
          {tr("workspace.rsv.create")}
        </Button>
      </section>

      {coverage && (
        <section className="space-y-3 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-success-text)]">
            <ShieldCheck size={15} aria-hidden="true" />
            Antwort der Versicherung (API)
          </h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--ds-text-muted)]">Referenz</dt>
              <dd className="font-mono font-medium">{coverage.reference}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--ds-text-muted)]">Deckung</dt>
              <dd className="font-medium">
                {coverage.covered ? "Gedeckt" : "Nicht gedeckt"}
                {coverage.requires_pre_approval ? " (Vorabgenehmigung nötig)" : ""}
              </dd>
            </div>
            {coverage.coverage_amount != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--ds-text-muted)]">Deckungssumme</dt>
                <dd className="font-medium tabular-nums">
                  {coverage.coverage_amount.toLocaleString("de-AT", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </dd>
              </div>
            )}
            {coverage.deductible != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--ds-text-muted)]">Selbstbehalt</dt>
                <dd className="font-medium tabular-nums">
                  {coverage.deductible.toLocaleString("de-AT", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </dd>
              </div>
            )}
          </dl>
          {coverage.conditions && coverage.conditions.length > 0 && (
            <ul className="list-inside list-disc text-xs text-[color:var(--ds-text-muted)]">
              {coverage.conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {email && (
        <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {tr("workspace.rsv.ready")}
            </h2>
            <Button variant="outline" size="sm" onClick={() => void copyEmail()}>
              {copied ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
              {copied ? "Kopiert" : "Text kopieren"}
            </Button>
          </div>
          <p className="text-sm font-medium text-[color:var(--ds-text)]">{email.subject}</p>
          <pre className="rounded-lg bg-[color:var(--ds-surface-2)] p-4 font-sans text-xs whitespace-pre-wrap text-[color:var(--ds-text)]">
            {email.body}
          </pre>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
          {tr("workspace.rsv.status")}
        </h2>
        {loading ? (
          <RowSkeleton count={3} />
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
          >
            {loadError}
          </div>
        ) : items.length ? (
          <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-[color:var(--ds-text)]">
                    {i.client_name} · {i.insurance_provider}
                  </div>
                  <div className="truncate text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                    {caseLabel(i.case_slug)}
                    {i.created_at ? ` · ${formatDate(i.created_at)}` : ""}
                  </div>
                </div>
                <Badge
                  variant="default"
                  className={`shrink-0 border text-xs ${COVERAGE_TONE[i.coverage_status] ?? ""}`}
                >
                  {COVERAGE_LABELS[i.coverage_status] ?? i.coverage_status}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title={tr("workspace.rsv.empty")}
            description="Erzeugen Sie oben eine Deckungsanfrage — der Status erscheint dann hier."
          />
        )}
      </section>
    </div>
  );
}
