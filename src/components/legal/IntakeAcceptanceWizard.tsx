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
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { encodeSlugPath } from "@/lib/utils";
import {
  canAcceptMandate,
  updateConflictCheck,
  type IntakeAcceptanceWorkflow,
} from "@/lib/intake-acceptance";
import type { ConflictCheckResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AcceptanceStep = "conflict" | "kyc" | "poa" | "engagement" | "convert";

export interface IntakeAcceptanceItem {
  slug: string;
  title: string;
  frontmatter: {
    client_name?: string;
    email?: string;
    phone_hash?: string;
    legal_area?: string;
    summary: string;
    acceptance?: IntakeAcceptanceWorkflow;
    source?: string;
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
  { id: "kyc", label: "KYC / GwG", icon: UserCheck },
  { id: "poa", label: "Vollmacht", icon: PenTool },
  { id: "engagement", label: "Mandatsbrief", icon: FileText },
  { id: "convert", label: "Akte anlegen", icon: FileCheck },
];

export function IntakeAcceptanceWizard({
  open,
  onOpenChange,
  item,
  caseSlug,
  onUpdated,
  onConverted,
}: IntakeAcceptanceWizardProps) {
  const { t } = useLang();
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
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

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
  }, [item, open]);

  const canProceed = useMemo(() => {
    switch (step) {
      case "conflict":
        return workflow.conflict_check.status === "clear" || workflow.conflict_check.waived;
      case "kyc":
        return workflow.kyc.status === "verified" || workflow.kyc.status === "not_required";
      case "poa":
        return workflow.poa.status === "signed" || workflow.poa.status === "not_required";
      case "engagement":
        return (
          workflow.engagement_letter.status === "sent" ||
          workflow.engagement_letter.status === "draft"
        );
      case "convert":
        return canAcceptMandate(workflow).ok;
      default:
        return false;
    }
  }, [step, workflow]);

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.id === step), [step]);

  const updateWorkflow = useCallback((patch: Partial<IntakeAcceptanceWorkflow>) => {
    setWorkflow((prev) => ({ ...prev, ...patch }) as IntakeAcceptanceWorkflow);
    setDirty(true);
  }, []);

  async function performConflictCheck() {
    const name = item.frontmatter.client_name?.trim();
    if (!name) {
      addToast({ type: "error", title: "Mandantenname fehlt" });
      return;
    }
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await api.legal.conflictCheck(name);
      setCheckResult(result);
      const next = updateConflictCheck(workflow, result, "current-user");
      setWorkflow(next);
      setDirty(true);
      if (result.severity === "critical") {
        addToast({
          type: "warning",
          title: "Kritische Kollision erkannt",
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
      });
      addToast({ type: "success", title: "Akte angelegt" });
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
                        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "brand-text bg-[color:var(--brand-glow)]"
                          : done
                            ? "text-emerald-600 hover:bg-[color:var(--ds-hover)]"
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
                    § 43a BRAO verpflichtet zur Prüfung von Interessenkonflikten vor Mandatsannahme.
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
                        ? "border-red-500/20 bg-red-500/5"
                        : checkResult.severity === "low"
                          ? "border-amber-500/20 bg-amber-500/5"
                          : "border-emerald-500/20 bg-emerald-500/5"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {checkResult.severity === "critical" ? (
                        <AlertTriangle size={16} className="text-red-600" />
                      ) : checkResult.severity === "low" ? (
                        <AlertTriangle size={16} className="text-amber-600" />
                      ) : (
                        <CheckCircle2 size={16} className="text-emerald-600" />
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
                            {!m.exact && <span className="text-amber-600"> — ähnlich</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {workflow.conflict_check.status === "conflict" && (
                  <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-start gap-2">
                      <ShieldAlert size={16} className="mt-0.5 text-amber-600" />
                      <p className="text-sm text-amber-700">
                        Konflikt erkannt. Nur Partner/Admin kann mit Begründung freigeben.
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
                      onClick={() => {
                        const next = {
                          ...workflow,
                          conflict_check: {
                            ...workflow.conflict_check,
                            status: "clear" as const,
                            waived: true,
                            waived_by: "current-user",
                            waived_reason: waiverReason,
                            waived_at: new Date().toISOString(),
                          },
                        };
                        setWorkflow(next);
                        setDirty(true);
                      }}
                      disabled={!waiverReason.trim()}
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
                <h3 className="text-sm font-medium">KYC / GwG</h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Identität und Risikoeinschätzung nach § 1 ff. GwG.
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
                    KYC nicht erforderlich (z. B. bestehender Mandant)
                  </label>
                  {workflow.kyc.required && (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={workflow.kyc.status === "verified"}
                          onChange={(e) =>
                            updateWorkflow({
                              kyc: {
                                ...workflow.kyc,
                                status: e.target.checked ? "verified" : "pending",
                              },
                            })
                          }
                          className="rounded border-[color:var(--ds-border)]"
                        />
                        KYC-Verifizierung abgeschlossen
                      </label>
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
                        KYC-Seite öffnen
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
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={workflow.poa.status === "signed"}
                          onChange={(e) =>
                            updateWorkflow({
                              poa: {
                                ...workflow.poa,
                                status: e.target.checked ? "signed" : "pending",
                              },
                            })
                          }
                          className="rounded border-[color:var(--ds-border)]"
                        />
                        Vollmacht unterschrieben vorhanden
                      </label>
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
                    onClick={() =>
                      updateWorkflow({
                        engagement_letter: { status: "draft" },
                      })
                    }
                    className="gap-2"
                  >
                    <Send size={14} />
                    Entwurf generieren
                  </Button>
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
                  <StatusRow
                    label="Vollmacht"
                    ok={workflow.poa.status === "signed" || workflow.poa.status === "not_required"}
                  />
                  <StatusRow
                    label="Mandatsbrief"
                    ok={workflow.engagement_letter.status === "sent"}
                  />
                </div>
                {!canAcceptMandate(workflow).ok && (
                  <p className="text-xs text-red-600">
                    Es fehlen noch Pflichtschritte. Bitte alle Schritte abschließen.
                  </p>
                )}
                <Button
                  type="button"
                  onClick={() => void handleConvert()}
                  disabled={submitting || !canAcceptMandate(workflow).ok}
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
      <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "OK" : "offen"}</span>
    </div>
  );
}
