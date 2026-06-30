"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import {
  FileText,
  Loader2,
  AlertTriangle,
  Clock,
  Gavel,
  Euro,
  ChevronDown,
  Copy,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppealPanelProps {
  assessmentSlug: string;
}

interface AppealResult {
  assessment_summary: string;
  contested_points: Array<{
    position: string;
    tax_office_view: string;
    taxpayer_view: string;
    legal_basis: string;
    disputed_amount: number;
    success_prospect: "stark" | "mittel" | "schwach" | "keine";
    required_evidence: string[];
  }>;
  deadline: string;
  deadline_legal_basis: string;
  days_remaining: number;
  success_prospect_summary: string;
  total_disputed_amount: number;
  draft_letter: {
    recipient: string;
    subject: string;
    body: string;
    requests: string[];
  };
  recommendations: string[];
  generatedAt: string;
}

const PROSPECT_COLORS: Record<string, string> = {
  stark: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  mittel: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  schwach: "text-orange-600 bg-orange-500/10 border-orange-500/20",
  keine: "text-rose-600 bg-rose-500/10 border-rose-500/20",
};

export function TaxAppealGeneratorPanel({ assessmentSlug }: AppealPanelProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppealResult | null>(null);
  const [contestedPoints, setContestedPoints] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tax.appealGenerator({
        assessmentSlug,
        contestedPoints: contestedPoints.trim() || undefined,
      });
      setResult(res);
      addToast({ type: "success", title: t("tax.appeal.title") });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.appeal.error"));
    } finally {
      setLoading(false);
    }
  }

  function copyDraft() {
    if (!result) return;
    const text = `${result.draft_letter.recipient}\n\n${result.draft_letter.subject}\n\n${result.draft_letter.body}\n\n${result.draft_letter.requests.map((r) => `${r}`).join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const locale = lang === "en" ? "en-GB" : "de-DE";
  const isOverdue = result && result.days_remaining < 0;
  const isUrgent = result && result.days_remaining >= 0 && result.days_remaining <= 7;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
            <Gavel size={16} className="brand-text" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("tax.appeal.title")}
            </h3>
            <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("tax.appeal.desc")}</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void generate()}
          disabled={loading}
          className="brand-bg gap-2 text-white"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Gavel size={14} />}
          {loading ? t("tax.appeal.generating") : t("tax.appeal.generate")}
        </Button>
      </div>

      {!result && !loading && (
        <div className="mb-4 space-y-2">
          <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
            {t("tax.appeal.contested_hint")}
          </label>
          <textarea
            value={contestedPoints}
            onChange={(e) => setContestedPoints(e.target.value)}
            rows={3}
            placeholder={t("tax.appeal.contested_placeholder")}
            className="focus:brand-border/40 w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-600">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!result && !error && !loading && (
        <p className="py-6 text-center text-sm text-[color:var(--ds-text-subtle)]">
          {t("tax.appeal.empty")}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border px-4 py-3",
              isOverdue
                ? "border-rose-500/30 bg-rose-500/5"
                : isUrgent
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
            )}
          >
            <Clock
              size={18}
              className={cn(
                isOverdue
                  ? "text-rose-600"
                  : isUrgent
                    ? "text-amber-600"
                    : "text-[color:var(--ds-text-muted)]"
              )}
            />
            <div className="flex-1">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("tax.appeal.deadline")}
              </p>
              <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                {result.deadline
                  ? new Date(result.deadline).toLocaleDateString(locale, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}{" "}
                ({result.deadline_legal_basis})
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "text-lg font-bold",
                  isOverdue
                    ? "text-rose-600"
                    : isUrgent
                      ? "text-amber-600"
                      : "text-[color:var(--ds-text)]"
                )}
              >
                {result.days_remaining > 0
                  ? `${result.days_remaining} ${t("tax.appeal.days")}`
                  : result.days_remaining === 0
                    ? t("tax.appeal.today")
                    : `${Math.abs(result.days_remaining)} ${t("tax.appeal.overdue")}`}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("tax.appeal.summary")}
            </p>
            <p className="text-sm text-[color:var(--ds-text)]">{result.assessment_summary}</p>
          </div>

          {result.contested_points.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.appeal.contested_points")} ({result.contested_points.length})
              </p>
              {result.contested_points.map((cp, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {cp.position}
                    </span>
                    <Badge
                      variant="default"
                      className={cn(
                        "border whitespace-nowrap",
                        PROSPECT_COLORS[cp.success_prospect]
                      )}
                    >
                      {cp.success_prospect}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-xs">
                    <div>
                      <span className="font-medium text-[color:var(--ds-text-muted)]">
                        {t("tax.appeal.fa_view")}:{" "}
                      </span>
                      <span className="text-[color:var(--ds-text)]">{cp.tax_office_view}</span>
                    </div>
                    <div>
                      <span className="font-medium text-[color:var(--ds-text-muted)]">
                        {t("tax.appeal.taxpayer_view")}:{" "}
                      </span>
                      <span className="text-[color:var(--ds-text)]">{cp.taxpayer_view}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[color:var(--ds-text-muted)]">
                        {cp.legal_basis}
                      </span>
                      {cp.disputed_amount > 0 && (
                        <span className="flex items-center gap-1 font-medium text-[color:var(--ds-text)]">
                          <Euro size={11} />
                          {cp.disputed_amount.toLocaleString(locale)}
                        </span>
                      )}
                    </div>
                    {cp.required_evidence.length > 0 && (
                      <div className="text-[color:var(--ds-text-muted)]">
                        <span className="font-medium">{t("tax.appeal.evidence")}: </span>
                        {cp.required_evidence.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[color:var(--ds-border)] p-3 text-center">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("tax.appeal.total_disputed")}
              </p>
              <p className="text-lg font-bold text-[color:var(--brand-primary)]">
                {result.total_disputed_amount.toLocaleString(locale)} EUR
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] p-3 text-center">
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("tax.appeal.prospect")}
              </p>
              <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                {result.success_prospect_summary}
              </p>
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowDraft((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-[color:var(--ds-text-muted)]"
            >
              <span className="flex items-center gap-1.5">
                <FileText size={12} />
                {t("tax.appeal.draft_letter")}
              </span>
              <div className="flex items-center gap-2">
                {showDraft && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyDraft();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        copyDraft();
                      }
                    }}
                    className="flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                  >
                    {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                    {copied ? t("tax.appeal.copied") : t("tax.appeal.copy")}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={cn("transition-transform", showDraft && "rotate-180")}
                />
              </div>
            </button>
            {showDraft && (
              <div className="mt-2 space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {result.draft_letter.recipient}
                </p>
                <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {result.draft_letter.subject}
                </p>
                <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                  {result.draft_letter.body}
                </pre>
                {result.draft_letter.requests.length > 0 && (
                  <div className="border-t border-[color:var(--ds-border)] pt-2">
                    <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
                      {t("tax.appeal.requests")}
                    </p>
                    <ul className="space-y-1">
                      {result.draft_letter.requests.map((r, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-[color:var(--ds-text)]"
                        >
                          <span className="brand-text mt-0.5 text-xs">▸</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {result.recommendations.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                <ListChecks size={12} /> {t("tax.appeal.recommendations")}
              </p>
              <ul className="space-y-1">
                {result.recommendations.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-[color:var(--ds-text)]"
                  >
                    <span className="brand-text mt-0.5 text-xs">▸</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
