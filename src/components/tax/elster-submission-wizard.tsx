"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Loader2, Check, ChevronRight, FileJson, AlertTriangle, Copy } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { buildElsterXml } from "@/lib/elster";
import { cn } from "@/lib/utils";

const FORM_TYPES = ["UStVA", "LStA", "ZM", "ESt", "USt", "GewSt", "KSt"] as const;
type FormType = (typeof FORM_TYPES)[number];

const STEPS = ["data", "review", "submit"] as const;
type Step = (typeof STEPS)[number];

interface ElsterSubmissionWizardProps {
  onSubmitted?: () => void;
}

export function ElsterSubmissionWizard({ onSubmitted }: ElsterSubmissionWizardProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();

  const [step, setStep] = useState<Step>("data");
  const [clientName, setClientName] = useState("");
  const [formType, setFormType] = useState<FormType>("UStVA");
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [year, setYear] = useState(new Date().getFullYear());
  const [taxAmount, setTaxAmount] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const canProceedData = clientName.trim().length > 0 && period.trim().length > 0;

  const xmlPreview = useCallback(() => {
    try {
      return buildElsterXml({
        clientId: clientName.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-"),
        clientName,
        formType,
        period,
        year,
        taxAmount: taxAmount ? Number(taxAmount) : undefined,
        refundAmount: refundAmount ? Number(refundAmount) : undefined,
      });
    } catch {
      return null;
    }
  }, [clientName, formType, period, year, taxAmount, refundAmount]);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await api.tax.elster.submit({
        clientId: clientName.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-"),
        clientName: clientName.trim(),
        formType,
        period,
        year,
        taxAmount: taxAmount ? Number(taxAmount) : undefined,
        refundAmount: refundAmount ? Number(refundAmount) : undefined,
      });
      setSubmitResult({
        ok: true,
        message: `${t("elster.submit_success")} ${res.submission.elsterReference ?? res.submission.id}`,
      });
      addToast({ type: "success", title: t("elster.submit_success") });
      if (onSubmitted) onSubmitted();
    } catch (err) {
      setSubmitResult({
        ok: false,
        message: err instanceof Error ? err.message : t("elster.submit_error"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyXml() {
    const xml = xmlPreview();
    if (!xml) return;
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const reset = () => {
    setStep("data");
    setClientName("");
    setTaxAmount("");
    setRefundAmount("");
    setSubmitResult(null);
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <Card className="p-5">
      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                i < stepIndex
                  ? "bg-emerald-500/10 text-emerald-600"
                  : i === stepIndex
                    ? "brand-bg text-white"
                    : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-subtle)]"
              )}
            >
              {i < stepIndex ? <Check size={14} /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                i === stepIndex
                  ? "text-[color:var(--ds-text)]"
                  : "text-[color:var(--ds-text-subtle)]"
              )}
            >
              {s === "data"
                ? lang === "en"
                  ? "Data"
                  : "Daten"
                : s === "review"
                  ? lang === "en"
                    ? "Review"
                    : "Prüfung"
                  : lang === "en"
                    ? "Submit"
                    : "Übermittlung"}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} className="text-[color:var(--ds-text-subtle)]" />
            )}
          </div>
        ))}
      </div>

      {/* Step: Data */}
      {step === "data" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="wiz-client" className="text-xs">
                {t("elster.client_name")} *
              </Label>
              <Input
                id="wiz-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={t("elster.client_name_placeholder")}
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="wiz-form" className="text-xs">
                {t("elster.form_type")}
              </Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as FormType)}>
                <SelectTrigger id="wiz-form" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {ft}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="wiz-period" className="text-xs">
                {t("elster.period")} *
              </Label>
              <Input
                id="wiz-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder={t("elster.period_placeholder")}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="wiz-year" className="text-xs">
                {t("elster.year")}
              </Label>
              <Input
                id="wiz-year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="wiz-tax" className="text-xs">
                {t("elster.tax_amount")}
              </Label>
              <Input
                id="wiz-tax"
                type="number"
                step="0.01"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="wiz-refund" className="text-xs">
                {t("elster.refund_amount")}
              </Label>
              <Input
                id="wiz-refund"
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!canProceedData}
              onClick={() => setStep("review")}
              className="gap-2"
            >
              {lang === "en" ? "Review" : "Zur Prüfung"}
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4 text-sm">
            <ReviewRow label={t("elster.client_name")} value={clientName} />
            <ReviewRow label={t("elster.form_type")} value={formType} />
            <ReviewRow label={t("elster.period")} value={period} />
            <ReviewRow label={t("elster.year")} value={String(year)} />
            {taxAmount && (
              <ReviewRow
                label={t("elster.tax_amount")}
                value={`${Number(taxAmount).toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`}
              />
            )}
            {refundAmount && (
              <ReviewRow
                label={t("elster.refund_amount")}
                value={`${Number(refundAmount).toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`}
              />
            )}
          </div>

          {(() => {
            const xml = xmlPreview();
            return xml ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <FileJson size={16} />
                    {t("elster.xml_preview")}
                  </div>
                  <Button size="sm" variant="outline" onClick={copyXml}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? t("elster.copied") : t("elster.copy_xml")}
                  </Button>
                </div>
                <pre className="max-h-48 overflow-auto rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-xs text-[color:var(--ds-text-subtle)]">
                  {xml}
                </pre>
              </div>
            ) : null;
          })()}

          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <p className="text-xs text-amber-700">{t("elster.info_text")}</p>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("data")}>
              {lang === "en" ? "Back" : "Zurück"}
            </Button>
            <Button type="button" onClick={() => setStep("submit")} className="gap-2">
              {lang === "en" ? "Continue" : "Weiter"}
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Submit */}
      {step === "submit" && (
        <div className="space-y-4">
          {!submitResult && (
            <div className="py-6 text-center">
              <Send size={32} className="mx-auto text-[color:var(--brand-primary)]" />
              <p className="mt-3 text-sm text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "Ready to submit to ELSTER" : "Bereit zur Übermittlung an ELSTER"}
              </p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                {formType} {period} — {clientName}
              </p>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="brand-bg mt-4 gap-2 text-white"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {submitting ? t("elster.submitting") : t("elster.submit")}
              </Button>
            </div>
          )}

          {submitResult && (
            <div
              className={cn(
                "rounded-lg border p-4 text-center",
                submitResult.ok
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-rose-500/20 bg-rose-500/5"
              )}
            >
              {submitResult.ok ? (
                <Check size={28} className="mx-auto text-emerald-600" />
              ) : (
                <AlertTriangle size={28} className="mx-auto text-rose-600" />
              )}
              <p
                className={cn(
                  "mt-2 text-sm font-medium",
                  submitResult.ok ? "text-emerald-700" : "text-rose-700"
                )}
              >
                {submitResult.message}
              </p>
              <Button type="button" variant="outline" onClick={reset} className="mt-4">
                {lang === "en" ? "New Submission" : "Neue Übermittlung"}
              </Button>
            </div>
          )}

          {!submitResult && (
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep("review")}>
                {lang === "en" ? "Back" : "Zurück"}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[color:var(--ds-text-subtle)]">{label}</p>
      <p className="font-medium text-[color:var(--ds-text)]">{value}</p>
    </div>
  );
}
