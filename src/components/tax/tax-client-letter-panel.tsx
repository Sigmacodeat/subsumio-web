"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Mail, Loader2, AlertTriangle, Copy, CheckCircle2, Send, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientLetterProps {
  clientSlug: string;
}

interface LetterResult {
  recipient_name: string;
  recipient_address: string;
  subject: string;
  body: string;
  key_points: string[];
  call_to_action: string;
  generatedAt: string;
}

const OCCASIONS = [
  { value: "quarterly_update", label_de: "Quartalsinformation", label_en: "Quarterly Update" },
  { value: "law_change", label_de: "Gesetzesänderung", label_en: "Law Change" },
  { value: "reminder", label_de: "Erinnerung", label_en: "Reminder" },
  {
    value: "assessment_received",
    label_de: "Steuerbescheid eingegangen",
    label_en: "Assessment Received",
  },
  { value: "audit_notice", label_de: "Betriebsprüfungsankündigung", label_en: "Audit Notice" },
  { value: "year_end", label_de: "Jahresabschluss", label_en: "Year-End" },
  { value: "custom", label_de: "Individuell", label_en: "Custom" },
] as const;

export function TaxClientLetterPanel({ clientSlug }: ClientLetterProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LetterResult | null>(null);
  const [occasion, setOccasion] = useState<string>("quarterly_update");
  const [customOccasion, setCustomOccasion] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [showLetter, setShowLetter] = useState(true);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tax.clientLetter({
        clientSlug,
        occasion: occasion as (typeof OCCASIONS)[number]["value"],
        customOccasion: occasion === "custom" ? customOccasion.trim() : undefined,
        keyPoints: keyPoints.trim() || undefined,
      });
      setResult(res);
      setShowLetter(true);
      addToast({ type: "success", title: t("tax.letter.title") });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.letter.error"));
    } finally {
      setLoading(false);
    }
  }

  function copyLetter() {
    if (!result) return;
    const text = `${result.recipient_name}\n${result.recipient_address}\n\n${result.subject}\n\n${result.body}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
            <Mail size={16} className="brand-text" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("tax.letter.title")}
            </h3>
            <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("tax.letter.desc")}</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void generate()}
          disabled={loading}
          className="brand-bg gap-2 text-white"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          {loading ? t("tax.letter.generating") : t("tax.letter.generate")}
        </Button>
      </div>

      {/* Input controls */}
      <div className="mb-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
            {t("tax.letter.occasion")}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {OCCASIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setOccasion(o.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  occasion === o.value
                    ? "brand-soft brand-text brand-border border"
                    : "border border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                {lang === "en" ? o.label_en : o.label_de}
              </button>
            ))}
          </div>
        </div>

        {occasion === "custom" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("tax.letter.custom_occasion")}
            </label>
            <input
              type="text"
              value={customOccasion}
              onChange={(e) => setCustomOccasion(e.target.value)}
              placeholder={t("tax.letter.custom_placeholder")}
              className="focus:brand-border/40 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
            {t("tax.letter.key_points")}
          </label>
          <textarea
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            rows={2}
            placeholder={t("tax.letter.key_points_placeholder")}
            className="focus:brand-border/40 w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-600">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!result && !error && !loading && (
        <p className="py-6 text-center text-sm text-[color:var(--ds-text-subtle)]">
          {t("tax.letter.empty")}
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {/* Collapsible header */}
          <button
            onClick={() => setShowLetter((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-[color:var(--ds-text-muted)]"
          >
            <span className="flex items-center gap-1.5">
              <Send size={12} />
              {result.subject}
            </span>
            <div className="flex items-center gap-2">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  copyLetter();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    copyLetter();
                  }
                }}
                className="flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
              >
                {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                {copied ? t("tax.letter.copied") : t("tax.letter.copy")}
              </span>
              <ChevronDown
                size={14}
                className={cn("transition-transform", showLetter && "rotate-180")}
              />
            </div>
          </button>

          {showLetter && (
            <div className="space-y-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
              <div>
                <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.letter.recipient")}
                </p>
                <p className="text-sm text-[color:var(--ds-text)]">{result.recipient_name}</p>
                {result.recipient_address && (
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {result.recipient_address}
                  </p>
                )}
              </div>

              <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                {result.body}
              </pre>

              {result.key_points.length > 0 && (
                <div className="border-t border-[color:var(--ds-border)] pt-2">
                  <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {t("tax.letter.points")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.key_points.map((p, i) => (
                      <Badge key={i} variant="default" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.call_to_action && (
                <div className="rounded-lg border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-primary)]/5 px-3 py-2">
                  <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {t("tax.letter.cta")}
                  </p>
                  <p className="text-sm text-[color:var(--ds-text)]">{result.call_to_action}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
