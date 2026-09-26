"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ShieldAlert,
  Loader2,
  AlertTriangle,
  FileCheck,
  FileText,
  UserCheck,
  ChevronRight,
  ChevronLeft,
  Shield,
  PenTool,
  Send,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { KYCVerification } from "@/lib/kyc";
import { isPoAValid, type PowerOfAttorney } from "@/lib/power-of-attorney";
import type { FeeAgreement, FeeModelType } from "@/lib/fee-agreements";
import { disputeValueFromInput } from "@/lib/dispute-value";
import { csrfFetch } from "@/lib/csrf";
import { encodeSlugPath } from "@/lib/utils";
import { canAcceptMandate, type IntakeAcceptanceWorkflow } from "@/lib/intake-acceptance";
import type { ConflictCheckResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AcceptanceStep = "conflict" | "kyc" | "poa" | "engagement" | "fee" | "convert";

export interface IntakeAcceptanceItem {
  slug: string;
  title: string;
  frontmatter: {
    client_name?: string;
    email?: string;
    phone_hash?: string;
    legal_area?: string;
    /** Gegenseite laut Erstanfrage — wird als Gegner in die Akte übernommen. */
    opponent?: string;
    summary: string;
    acceptance?: IntakeAcceptanceWorkflow;
    source?: string;
    missing_documents?: string[];
  };
}

interface IntakeAcceptanceWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: IntakeAcceptanceItem;
  caseSlug?: string;
  onUpdated?: () => void;
  onConverted?: (result: { case?: { slug?: string } }) => void;
}

const STEPS: Array<{ id: AcceptanceStep; label: string; icon: React.ElementType }> = [
  { id: "conflict", label: "Kollisionsprüfung", icon: ShieldAlert },
  { id: "kyc", label: "Identitätsprüfung", icon: UserCheck },
  { id: "poa", label: "Vollmacht", icon: PenTool },
  { id: "engagement", label: "Mandatsbrief", icon: FileText },
  { id: "fee", label: "Honorar", icon: Wallet },
  { id: "convert", label: "Akte anlegen", icon: FileCheck },
];

const FEE_MODEL_LABELS: Record<FeeModelType, string> = {
  hourly: "Stundensatz",
  flat: "Pauschale",
  rvg: "Tarif (RATG/AHK)",
  capped: "Stundensatz mit Obergrenze",
};

/** Whether the acceptance may go past the POA step: signed = a linked, valid record. */
export function poaStepComplete(poa: IntakeAcceptanceWorkflow["poa"]): boolean {
  if (!poa.required || poa.status === "not_required") return true;
  return poa.status === "signed" && Boolean(poa.poa_slug);
}

export function IntakeAcceptanceWizard({
  open,
  onOpenChange,
  item,
  caseSlug,
  onUpdated,
  onConverted,
}: IntakeAcceptanceWizardProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [workflow, setWorkflow] = useState<IntakeAcceptanceWorkflow>(() => {
    return (
      item.frontmatter.acceptance ?? {
        conflict_check: { status: "pending" },
        kyc: { required: true, status: "pending" },
        poa: { required: true, status: "pending" },
        engagement_letter: { status: "pending" },
      }
    );
  });

  const [step, setStep] = useState<AcceptanceStep>("conflict");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<ConflictCheckResponse | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [waiving, setWaiving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [kycRecords, setKycRecords] = useState<KYCVerification[] | null>(null);
  const [sendDocRequest, setSendDocRequest] = useState(false);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [poaRecords, setPoaRecords] = useState<PowerOfAttorney[] | null>(null);
  const [feeAgreements, setFeeAgreements] = useState<FeeAgreement[] | null>(null);
  const [feeForm, setFeeForm] = useState<{ model: FeeModelType; amount: string; note: string }>({
    model: "hourly",
    amount: "",
    note: "",
  });
  const [savingFee, setSavingFee] = useState(false);
  const [disputeValue, setDisputeValue] = useState("");

  useEffect(() => {
    setWorkflow(
      item.frontmatter.acceptance ?? {
        conflict_check: { status: "pending" },
        kyc: { required: true, status: "pending" },
        poa: { required: true, status: "pending" },
        engagement_letter: { status: "pending" },
      }
    );
    setStep("conflict");
    setCheckResult(null);
    setWaiverReason("");
    setDirty(false);
    setSendDocRequest(false);
    setPortalEnabled(false);
    setDisputeValue("");
  }, [item, open]);

  // Powers of attorney recorded for this intake (created on the POA page
  // under the intake). Reloaded whenever the step is shown.
  useEffect(() => {
    if (!open || step !== "poa") return;
    let cancelled = false;
    setPoaRecords(null);
    fetch(`/api/power-of-attorney?case_slug=${encodeURIComponent(item.slug)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json: { data?: { items?: PowerOfAttorney[] } }) => {
        if (!cancelled) setPoaRecords(json.data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setPoaRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, item.slug]);

  const loadFeeAgreements = useCallback(async () => {
    setFeeAgreements(null);
    try {
      const r = await fetch(`/api/fee-agreements?case_slug=${encodeURIComponent(item.slug)}`, {
        cache: "no-store",
      });
      const json = (await r.json()) as { data?: { items?: FeeAgreement[] } };
      setFeeAgreements(r.ok ? (json.data?.items ?? []) : []);
    } catch {
      setFeeAgreements([]);
    }
  }, [item.slug]);

  useEffect(() => {
    if (!open || step !== "fee") return;
    void loadFeeAgreements();
  }, [open, step, loadFeeAgreements]);

  async function saveFeeAgreement() {
    const amount = Number(feeForm.amount.replace(/\./g, "").replace(",", "."));
    const needsAmount = feeForm.model !== "rvg";
    if (needsAmount && (!Number.isFinite(amount) || amount <= 0)) {
      addToast({ type: "error", title: "Bitte einen Betrag angeben" });
      return;
    }
    setSavingFee(true);
    try {
      const res = await csrfFetch("/api/fee-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Filed under the intake; moved to the matter when it is created.
          case_slug: item.slug,
          model: feeForm.model,
          ...(feeForm.model === "hourly" || feeForm.model === "capped"
            ? { hourly_rate: amount }
            : {}),
          ...(feeForm.model === "flat" ? { flat_amount: amount } : {}),
          ...(feeForm.model === "rvg" && feeForm.note.trim()
            ? { rvg_area: feeForm.note.trim() }
            : {}),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(err.message || err.error || "save_failed");
      }
      setFeeForm({ model: "hourly", amount: "", note: "" });
      addToast({ type: "success", title: "Honorarvereinbarung erfasst" });
      await loadFeeAgreements();
    } catch (err) {
      addToast({
        type: "error",
        title: "Honorarvereinbarung nicht gespeichert",
        description:
          err instanceof Error && err.message !== "save_failed" ? err.message : undefined,
      });
    } finally {
      setSavingFee(false);
    }
  }

  // Identification checks recorded for this intake (the KYC page stores them
  // under the intake slug). Reloaded whenever the step is shown, so a check
  // completed in the other tab appears here.
  useEffect(() => {
    if (!open || step !== "kyc") return;
    let cancelled = false;
    setKycRecords(null);
    fetch(`/api/kyc?case_slug=${encodeURIComponent(item.slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { data?: { items?: KYCVerification[] } }) => {
        if (!cancelled) setKycRecords(json.data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setKycRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, item.slug]);

  const canProceed = useMemo(() => {
    switch (step) {
      case "conflict":
        return workflow.conflict_check.status === "clear" || workflow.conflict_check.waived;
      case "kyc":
        return workflow.kyc.status === "verified" || workflow.kyc.status === "not_required";
      case "poa":
        return poaStepComplete(workflow.poa);
      case "engagement":
        return (
          workflow.engagement_letter.status === "sent" ||
          workflow.engagement_letter.status === "draft"
        );
      case "fee":
        // Optional: without an agreement the firm's own rate applies.
        return true;
      case "convert":
        return canAcceptMandate(workflow).ok && poaStepComplete(workflow.poa);
      default:
        return false;
    }
  }, [step, workflow]);

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.id === step), [step]);

  const updateWorkflow = useCallback((patch: Partial<IntakeAcceptanceWorkflow>) => {
    setWorkflow((prev) => ({ ...prev, ...patch }) as IntakeAcceptanceWorkflow);
    setDirty(true);
  }, []);

  // The check runs on the server (client AND opponent, each with its side in
  // the new mandate) and the server records it with the real user — the
  // wizard only displays the result.
  async function performConflictCheck() {
    const name = item.frontmatter.client_name?.trim();
    if (!name) {
      addToast({ type: "error", title: "Mandantenname fehlt" });
      return;
    }
    setChecking(true);
    setCheckResult(null);
    try {
      const { data } = await api.intake.conflictCheck(item.slug);
      const outcome = data.outcome;
      const result: ConflictCheckResponse = {
        name: outcome.parties.map((p) => p.name).join(" / "),
        severity: outcome.severity,
        explanation: outcome.parties.map((p) => p.explanation).join(" "),
        matches: (outcome.matches ?? []).map((m) => ({
          slug: m.slug,
          title: `${m.title} — ${m.party}`,
          role: m.role,
          status: "",
          matched_name: m.name,
          exact: m.exact ?? true,
          assessment: m.assessment,
        })),
        checked_cases: 0,
        disclaimer: "",
      };
      setCheckResult(result);
      setWorkflow((prev) => ({ ...prev, conflict_check: data.conflict_check }));
      onUpdated?.();
      if (result.severity === "critical") {
        addToast({
          type: "warning",
          title: "Kritische Kollision erkannt",
          description: result.explanation,
        });
      } else if (result.severity === "low") {
        addToast({
          type: "warning",
          title: "Treffer prüfen",
          description: result.explanation,
        });
      } else {
        addToast({ type: "success", title: "Keine Kollision" });
      }
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Kollisionsprüfung fehlgeschlagen",
      });
    } finally {
      setChecking(false);
    }
  }

  // Waiver is decided by the server: role (lawyer/admin), justification and
  // the real user are checked and recorded there.
  async function waiveConflict() {
    setWaiving(true);
    try {
      const { data } = await api.intake.waiveConflict(item.slug, waiverReason.trim());
      setWorkflow((prev) => ({ ...prev, conflict_check: data.conflict_check }));
      onUpdated?.();
      addToast({ type: "success", title: "Kollision begründet freigegeben" });
    } catch (err) {
      addToast({
        type: "error",
        title: "Freigabe nicht möglich",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setWaiving(false);
    }
  }

  async function generateEngagementLetter() {
    const clientName = item.frontmatter.client_name?.trim() || "Mandant";
    const legalArea = item.frontmatter.legal_area?.trim() || item.title;
    const summary = item.frontmatter.summary?.trim() || "";
    const today = new Date().toLocaleDateString("de-DE");
    const content = `Mandatsannahme-Schreiben\n\nDatum: ${today}\n\n${clientName}\n\nSehr geehrte Damen und Herren,\n\nhiermit bestätigen wir die Übernahme Ihres Mandates betreffend ${legalArea}.\n\nZusammenfassung:\n${summary}\n\nRechtsgebiet: ${legalArea}\nMandant: ${clientName}\n\nWir werden die anwaltliche Vertretung gemäß den uns bekannten Umständen übernehmen und Sie über den Fortgang informieren.\n\nMit freundlichen Grüßen\nIhre Kanzlei`;

    setGeneratingLetter(true);
    try {
      const slugBase = `intake/${item.slug}/engagement-letter`;
      const slug = `${slugBase}-${Date.now()}`;
      const page = {
        slug,
        title: `Mandatsannahme-Schreiben – ${clientName}`,
        type: "legal_document",
        content,
        frontmatter: {
          document_type: "engagement_letter",
          intake_slug: item.slug,
          client_name: clientName,
          legal_area: legalArea,
          generated_at: new Date().toISOString(),
        },
      };
      await api.brain.createPage(page);
      updateWorkflow({
        engagement_letter: {
          status: "draft",
          document_slug: slug,
          generated_at: new Date().toISOString(),
        },
      });
      addToast({ type: "success", title: "Mandatsbrief-Entwurf erstellt" });
    } catch (err) {
      addToast({
        type: "error",
        title: "Fehler",
        description: err instanceof Error ? err.message : "Erstellung fehlgeschlagen",
      });
    } finally {
      setGeneratingLetter(false);
    }
  }

  async function saveWorkflow() {
    try {
      await api.intake.update({
        slug: item.slug,
        acceptance: workflow as unknown as Record<string, unknown>,
      });
      setDirty(false);
      onUpdated?.();
      return true;
    } catch (err) {
      addToast({
        type: "error",
        title: "Speichern fehlgeschlagen",
        description: err instanceof Error ? err.message : undefined,
      });
      return false;
    }
  }

  async function handleNext() {
    if (stepIndex < STEPS.length - 1) {
      await saveWorkflow();
      setStep(STEPS[stepIndex + 1].id);
    }
  }

  async function handleConvert() {
    const result = canAcceptMandate(workflow);
    const parsedDispute = disputeValueFromInput(disputeValue);
    if (!parsedDispute.ok) {
      addToast({ type: "error", title: "Streitwert ungültig", description: "z. B. 12.000,50" });
      return;
    }
    if (!result.ok) {
      addToast({
        type: "error",
        title: "Mandatsannahme unvollständig",
        description: result.blocking.join(", "),
      });
      return;
    }
    setSubmitting(true);
    try {
      await saveWorkflow();
      const res = await api.intake.convert({
        slug: item.slug,
        case_slug: caseSlug?.trim() || undefined,
        title: item.frontmatter.client_name
          ? `${item.frontmatter.client_name}${item.frontmatter.legal_area ? ` - ${item.frontmatter.legal_area}` : ""}`
          : undefined,
        priority: "medium",
        portal_enabled: portalEnabled,
        send_document_request: sendDocRequest,
        ...(parsedDispute.value !== null ? { dispute_value: parsedDispute.value } : {}),
      });
      addToast({
        type: "success",
        title: "Akte angelegt",
        ...(res.document_request_slug
          ? {
              description: sendDocRequest
                ? "Unterlagen-Anfrage wurde als gesendet markiert."
                : "Unterlagen-Anfrage als Entwurf angelegt.",
            }
          : {}),
      });
      onConverted?.(res as { case?: { slug?: string } });
      onOpenChange(false);
      const createdCaseSlug = (res.case as { slug?: string } | undefined)?.slug;
      if (createdCaseSlug) router.push(`/dashboard/cases/${encodeSlugPath(createdCaseSlug)}`);
      else router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Konvertierung fehlgeschlagen";
      addToast({ type: "error", title: message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (dirty && !submitting && !checking) {
      if (!window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    }
    onOpenChange(false);
  }

  const StepIcon = STEPS[stepIndex].icon;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0">
        <div className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
                <StepIcon size={16} className="brand-text" />
              </div>
              <DialogTitle>Mandatsannahme</DialogTitle>
            </div>
            <DialogDescription>
              {item.frontmatter.client_name || item.title} —{" "}
              {item.frontmatter.legal_area || "Allgemein"}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="border-y border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-6 py-3">
            <ol className="flex items-center gap-1" aria-label="Mandatsannahme-Schritte">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const active = s.id === step;
                const done = i < stepIndex;
                return (
                  <li key={s.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setStep(s.id)}
                      disabled={i > stepIndex && !canProceed}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
                        active
                          ? "brand-text bg-[color:var(--brand-glow)]"
                          : done
                            ? "text-[color:var(--ds-success-text)] hover:bg-[color:var(--ds-hover)]"
                            : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                      )}
                      aria-current={active ? "step" : undefined}
                    >
                      {done ? <CheckCircle2 size={12} /> : <Icon size={12} />}
                      {s.label}
                    </button>
                    {i < STEPS.length - 1 && (
                      <ChevronRight size={12} className="text-[color:var(--ds-text-subtle)]" />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {step === "conflict" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Kollisionsprüfung</h3>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    § 10 RAO verpflichtet zur Prüfung von Interessenkonflikten vor Mandatsannahme.
                  </p>
                </div>

                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="text-sm text-[color:var(--ds-text)]">
                    {item.frontmatter.client_name || "—"}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {item.frontmatter.email}
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => void performConflictCheck()}
                  disabled={checking || !item.frontmatter.client_name}
                  className="brand-bg gap-2 text-white"
                >
                  {checking ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                  Kollisionsprüfung starten
                </Button>

                {checkResult && (
                  <div
                    className={cn(
                      "rounded-xl border p-4",
                      checkResult.severity === "critical"
                        ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
                        : checkResult.severity === "low"
                          ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
                          : "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {checkResult.severity === "critical" ? (
                        <AlertTriangle size={16} className="text-[color:var(--ds-danger-text)]" />
                      ) : checkResult.severity === "low" ? (
                        <AlertTriangle size={16} className="text-[color:var(--ds-warning-text)]" />
                      ) : (
                        <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" />
                      )}
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {checkResult.severity === "critical"
                          ? "Kritische Kollision"
                          : checkResult.severity === "low"
                            ? "Ähnlichkeit gefunden"
                            : "Kein Konflikt"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {checkResult.explanation}
                    </p>
                    {checkResult.matches.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {checkResult.matches.map((m) => (
                          <li key={m.slug} className="text-xs text-[color:var(--ds-text)]">
                            {m.title} ({m.role})
                            {!m.exact && (
                              <span className="text-[color:var(--ds-warning-text)]">
                                {" "}
                                — ähnlich
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {workflow.conflict_check.status === "conflict" &&
                  !workflow.conflict_check.waived && (
                    <div className="space-y-2 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
                      <div className="flex items-start gap-2">
                        <ShieldAlert
                          size={16}
                          className="mt-0.5 text-[color:var(--ds-warning-text)]"
                        />
                        <p className="text-sm text-[color:var(--ds-warning-text)]">
                          Konflikt erkannt. Nur Anwalt/Admin kann mit Begründung freigeben.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Freigabe-Begründung</Label>
                        <Input
                          value={waiverReason}
                          onChange={(e) => setWaiverReason(e.target.value)}
                          placeholder="z. B. beide Parteien haben Einverständnis erklärt"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void waiveConflict()}
                        disabled={waiving || waiverReason.trim().length < 10}
                        className="gap-2"
                      >
                        <CheckCircle2 size={14} />
                        Mit Begründung freigeben
                      </Button>
                    </div>
                  )}
              </div>
            )}

            {step === "kyc" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Identitätsprüfung</h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Identität und Risikoeinschätzung nach §§ 8a ff RAO.
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!workflow.kyc.required}
                      onChange={(e) =>
                        updateWorkflow({
                          kyc: {
                            ...workflow.kyc,
                            required: !e.target.checked,
                            status: "not_required",
                          },
                        })
                      }
                      className="rounded border-[color:var(--ds-border)]"
                    />
                    Keine Identitätsprüfung erforderlich (kein Geschäft nach § 8a RAO, z. B. reine
                    Prozessvertretung)
                  </label>
                  {workflow.kyc.required && (
                    <>
                      {kycRecords === null ? (
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          Prüfungen werden geladen…
                        </p>
                      ) : kycRecords.length === 0 ? (
                        <p className="text-sm text-[color:var(--ds-warning-text)]">
                          Für diese Anfrage gibt es noch keine Identitätsprüfung.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {kycRecords.map((k) => {
                            const slug = `legal/kyc/${k.id}`;
                            const linked = workflow.kyc.verification_slug === slug;
                            return (
                              <li
                                key={k.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm"
                              >
                                <span>
                                  {k.client_name} ·{" "}
                                  {k.status === "verified"
                                    ? "abgeschlossen"
                                    : k.status === "failed"
                                      ? "nicht bestanden"
                                      : "noch offen"}
                                </span>
                                {k.status === "verified" &&
                                  (linked ? (
                                    <span className="flex items-center gap-1 text-[color:var(--ds-success-text)]">
                                      <CheckCircle2 size={14} aria-hidden /> verknüpft
                                    </span>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        updateWorkflow({
                                          kyc: {
                                            ...workflow.kyc,
                                            status: "verified",
                                            verification_slug: slug,
                                            verified_at: k.verified_at,
                                            risk_level: k.risk_level,
                                          },
                                        })
                                      }
                                    >
                                      Mit dieser Prüfung annehmen
                                    </Button>
                                  ))}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          window.open(
                            `/dashboard/kyc?case_slug=${encodeURIComponent(item.slug)}&client_name=${encodeURIComponent(item.frontmatter.client_name || "")}`,
                            "_blank"
                          );
                        }}
                        className="gap-2"
                      >
                        <UserCheck size={14} />
                        Identitätsprüfung öffnen
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === "poa" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Vollmacht</h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Prozess- oder Generalvollmacht vor Versand/Verhandlung.
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!workflow.poa.required}
                      onChange={(e) =>
                        updateWorkflow({
                          poa: {
                            ...workflow.poa,
                            required: !e.target.checked,
                            status: "not_required",
                          },
                        })
                      }
                      className="rounded border-[color:var(--ds-border)]"
                    />
                    Vollmacht nicht erforderlich
                  </label>
                  {workflow.poa.required && (
                    <>
                      {poaRecords === null ? (
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          Vollmachten werden geladen…
                        </p>
                      ) : poaRecords.length === 0 ? (
                        <p className="text-sm text-[color:var(--ds-warning-text)]">
                          Für diese Anfrage gibt es noch keine Vollmacht. Bitte auf der
                          Vollmacht-Seite anlegen und unterschreiben lassen.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {poaRecords.map((p) => {
                            const slug = `legal/poa/${p.id}`;
                            const linked = workflow.poa.poa_slug === slug;
                            const valid = isPoAValid(p);
                            return (
                              <li
                                key={p.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm"
                              >
                                <span>
                                  {p.client_name} ·{" "}
                                  {valid
                                    ? "unterschrieben"
                                    : p.status === "sent"
                                      ? "zur Unterschrift versandt"
                                      : p.status === "signed"
                                        ? "abgelaufen"
                                        : "noch nicht unterschrieben"}
                                </span>
                                {valid &&
                                  (linked ? (
                                    <span className="flex items-center gap-1 text-[color:var(--ds-success-text)]">
                                      <CheckCircle2 size={14} aria-hidden /> verknüpft
                                    </span>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        updateWorkflow({
                                          poa: {
                                            ...workflow.poa,
                                            status: "signed",
                                            poa_slug: slug,
                                            type: p.type,
                                          },
                                        })
                                      }
                                    >
                                      Mit dieser Vollmacht annehmen
                                    </Button>
                                  ))}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {workflow.poa.status === "signed" && !workflow.poa.poa_slug && (
                        <p className="text-xs text-[color:var(--ds-warning-text)]">
                          Als unterschrieben markiert, aber keine Vollmacht verknüpft. Bitte die
                          unterschriebene Vollmacht oben auswählen.
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          window.open(
                            `/dashboard/power-of-attorney?case_slug=${encodeURIComponent(item.slug)}&client_name=${encodeURIComponent(item.frontmatter.client_name || "")}`,
                            "_blank"
                          );
                        }}
                        className="gap-2"
                      >
                        <PenTool size={14} />
                        Vollmacht-Seite öffnen
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === "engagement" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Mandatsannahme-Schreiben</h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Bestätigung der Mandatsübernahme an den Mandanten.
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={workflow.engagement_letter.status === "sent"}
                      onChange={(e) =>
                        updateWorkflow({
                          engagement_letter: {
                            ...workflow.engagement_letter,
                            status: e.target.checked ? "sent" : "draft",
                            sent_at: e.target.checked ? new Date().toISOString() : undefined,
                          },
                        })
                      }
                      className="rounded border-[color:var(--ds-border)]"
                    />
                    Mandatsbrief versandt
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void generateEngagementLetter()}
                    disabled={generatingLetter}
                    className="gap-2"
                  >
                    {generatingLetter ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    Entwurf generieren
                  </Button>
                  {workflow.engagement_letter.document_slug && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        window.open(
                          `/dashboard/brain/${encodeURIComponent(workflow.engagement_letter.document_slug!)}`,
                          "_blank"
                        )
                      }
                      className="gap-2"
                    >
                      <FileText size={14} />
                      Entwurf anzeigen
                    </Button>
                  )}
                </div>
              </div>
            )}

            {step === "fee" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Honorarvereinbarung</h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Optional. Die Vereinbarung wird mit der Akte verknüpft und bei der Abrechnung
                  verwendet; ohne Vereinbarung gilt der Kanzlei-Stundensatz.
                </p>
                {feeAgreements === null ? (
                  <p className="text-xs text-[color:var(--ds-text-muted)]">Wird geladen…</p>
                ) : feeAgreements.length > 0 ? (
                  <ul className="space-y-2">
                    {feeAgreements.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm"
                      >
                        <CheckCircle2
                          size={14}
                          className="text-[color:var(--ds-success-text)]"
                          aria-hidden
                        />
                        {FEE_MODEL_LABELS[a.model] ?? a.model}
                        {a.hourly_rate ? ` · ${a.hourly_rate} €/h` : ""}
                        {a.flat_amount ? ` · ${a.flat_amount} €` : ""}
                        {a.rvg_area ? ` · ${a.rvg_area}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    Noch keine Honorarvereinbarung erfasst.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-[color:var(--ds-border)] p-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="fee-model" className="text-xs">
                      Modell
                    </Label>
                    <select
                      id="fee-model"
                      value={feeForm.model}
                      onChange={(e) =>
                        setFeeForm({ ...feeForm, model: e.target.value as FeeModelType })
                      }
                      className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-sm"
                    >
                      {(Object.keys(FEE_MODEL_LABELS) as FeeModelType[]).map((m) => (
                        <option key={m} value={m}>
                          {FEE_MODEL_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {feeForm.model === "rvg" ? (
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="fee-note" className="text-xs">
                        Tarif / Tarifpost (optional)
                      </Label>
                      <Input
                        id="fee-note"
                        value={feeForm.note}
                        onChange={(e) => setFeeForm({ ...feeForm, note: e.target.value })}
                        placeholder="z. B. RATG, Einheitssatz"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="fee-amount" className="text-xs">
                        {feeForm.model === "flat" ? "Pauschale (€)" : "Stundensatz (€)"}
                      </Label>
                      <Input
                        id="fee-amount"
                        inputMode="decimal"
                        value={feeForm.amount}
                        onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })}
                        placeholder={feeForm.model === "flat" ? "z. B. 1.500" : "z. B. 280"}
                      />
                    </div>
                  )}
                  <div className="sm:col-span-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void saveFeeAgreement()}
                      disabled={savingFee}
                      className="gap-2"
                    >
                      {savingFee ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Wallet size={14} />
                      )}
                      Honorarvereinbarung erfassen
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === "convert" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Zusammenfassung</h3>
                <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-sm">
                  <StatusRow
                    label="Kollisionsprüfung"
                    ok={
                      workflow.conflict_check.status === "clear" || !!workflow.conflict_check.waived
                    }
                  />
                  <StatusRow
                    label="KYC"
                    ok={
                      workflow.kyc.status === "verified" || workflow.kyc.status === "not_required"
                    }
                  />
                  <StatusRow label="Vollmacht" ok={poaStepComplete(workflow.poa)} />
                  <StatusRow
                    label="Mandatsbrief"
                    ok={workflow.engagement_letter.status === "sent"}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Gegner</Label>
                    <p className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm">
                      {item.frontmatter.opponent?.trim() || "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="intake-dispute-value" className="text-xs">
                      Streitwert (€, optional)
                    </Label>
                    <Input
                      id="intake-dispute-value"
                      inputMode="decimal"
                      value={disputeValue}
                      onChange={(e) => setDisputeValue(e.target.value)}
                      placeholder="z. B. 12.000"
                    />
                  </div>
                </div>
                {!canAcceptMandate(workflow).ok && (
                  <p className="text-xs text-[color:var(--ds-danger-text)]">
                    Es fehlen noch Pflichtschritte. Bitte alle Schritte abschließen.
                  </p>
                )}
                {(item.frontmatter.missing_documents?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="send-doc-request"
                        checked={sendDocRequest}
                        onCheckedChange={(v) => setSendDocRequest(v === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <Label
                          htmlFor="send-doc-request"
                          className="text-sm font-medium text-[color:var(--ds-text)]"
                        >
                          Unterlagen-Anfrage als gesendet markieren
                        </Label>
                        <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                          Fehlende Unterlagen ({item.frontmatter.missing_documents!.join(", ")})
                          werden als Dokumentenanfrage in der Akte angelegt — als Entwurf oder
                          direkt gesendet.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                  <Checkbox
                    id="portal-enabled"
                    checked={portalEnabled}
                    onCheckedChange={(v) => setPortalEnabled(v === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <Label
                      htmlFor="portal-enabled"
                      className="text-sm font-medium text-[color:var(--ds-text)]"
                    >
                      Mandanten-Portal aktivieren
                    </Label>
                    <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                      Der Mandant erhält Zugang zum Portal
                      {(item.frontmatter.missing_documents?.length ?? 0) > 0
                        ? " — die Unterlagen-Anfrage enthält dann einen Upload-Link"
                        : ""}
                      .
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => void handleConvert()}
                  disabled={
                    submitting || !canAcceptMandate(workflow).ok || !poaStepComplete(workflow.poa)
                  }
                  className="brand-bg gap-2 text-white"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileCheck size={14} />
                  )}
                  Akte anlegen
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
                disabled={stepIndex === 0}
                className="gap-1 text-[color:var(--ds-text-muted)]"
              >
                <ChevronLeft size={14} /> Zurück
              </Button>
              <div className="flex items-center gap-2">
                {dirty && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveWorkflow()}
                    className="gap-2"
                  >
                    Speichern
                  </Button>
                )}
                {stepIndex < STEPS.length - 1 && (
                  <Button
                    type="button"
                    onClick={() => void handleNext()}
                    disabled={!canProceed}
                    className="brand-bg gap-2 text-white"
                  >
                    Weiter <ChevronRight size={14} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[color:var(--ds-text)]">{label}</span>
      <span
        className={
          ok ? "text-[color:var(--ds-success-text)]" : "text-[color:var(--ds-warning-text)]"
        }
      >
        {ok ? "OK" : "offen"}
      </span>
    </div>
  );
}
