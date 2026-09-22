"use client";

import { useState } from "react";
import {
  FileSearch,
  Loader2,
  AlertTriangle,
  Users,
  CalendarClock,
  Scale,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api, ApiRequestError } from "@/lib/api";
import type { DocumentAnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { CitationPanel } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { formatDate } from "@/lib/utils";

const SEVERITY_LABELS: Record<string, string> = {
  low: "Gering",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

/** Plain-language failure text — never the raw engine/provider message. */
function analyzeErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError && e.status === 404) {
    return "Das Dokument wurde nicht gefunden. Bitte prüfen Sie die Dokumentkennung.";
  }
  if (e instanceof ApiRequestError && e.status >= 500) {
    return "Die Analyse ist gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut.";
  }
  return fallback;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)] border-[color:var(--ds-info-border)]",
  medium:
    "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] border-[color:var(--ds-warning-border)]",
  high: "bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)] border-[color:var(--ds-attention-border)]",
  critical:
    "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]",
};

export default function AnalyzePage() {
  const { t } = useLang();
  const [slug, setSlug] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"slug" | "text">("slug");
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Every AI text surface verifies its statute citations (CLAUDE.md invariant).
  // The analyze route usually grounds server-side; when it does not, the hook does.
  const { grounding: clientGrounding, groundAnswer, reset: resetGrounding } = useGroundedAnswer();

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    resetGrounding();
    try {
      const res = await api.legal.analyzeDocument(
        mode === "slug" ? { document_slug: slug.trim() } : { text: text.trim() }
      );
      setResult(res);
      if (!res._grounding) {
        void groundAnswer(
          [res.summary, ...(res.issues ?? []).map((i) => `${i.issue}: ${i.rationale}`)].join("\n\n")
        );
      }
    } catch (e) {
      setError(analyzeErrorMessage(e, t("analyze.error_failed")));
    } finally {
      setLoading(false);
    }
  }

  const canRun = mode === "slug" ? slug.trim().length > 0 : text.trim().length > 0;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("analyze.title")}
        description={t("analyze.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("analyze.breadcrumb") },
        ]}
      />

      {/* Mode toggle */}
      <div className="flex flex-wrap gap-2" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "slug"}
          onClick={() => setMode("slug")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none",
            mode === "slug"
              ? "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] shadow-sm"
              : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
          )}
        >
          {t("analyze.mode_slug")}
        </button>
        <button
          role="tab"
          aria-selected={mode === "text"}
          onClick={() => setMode("text")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none",
            mode === "text"
              ? "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] shadow-sm"
              : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
          )}
        >
          {t("analyze.mode_text")}
        </button>
      </div>

      {/* Input */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        {mode === "slug" ? (
          <div>
            <label
              htmlFor="analyze-slug"
              className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
            >
              {t("analyze.slug_label")}
            </label>
            <Input
              id="analyze-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t("analyze.slug_placeholder")}
              className="mt-1.5 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]"
            />
            <p className="mt-1.5 text-xs text-[color:var(--ds-text-muted)]">
              {t("analyze.slug_hint")}
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="analyze-text"
              className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
            >
              {t("analyze.text_label")}
            </label>
            <textarea
              id="analyze-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("analyze.text_placeholder")}
              className="mt-1.5 h-48 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
          </div>
        )}
        <Button onClick={run} disabled={loading || !canRun} className="gap-2 whitespace-nowrap">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />}
          {t("analyze.run_btn")}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {result.document_type}
                  </Badge>
                  {result.type_confidence !== undefined && (
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("analyze.confidence")}: {Math.round(result.type_confidence * 100)} %
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[color:var(--ds-text)]">{result.summary}</p>
              </div>
              {/* The attorney-review notice lives once, in the CitationPanel below. */}
            </div>
          </div>

          {/* Parties */}
          {result.parties.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <Users size={14} /> {t("analyze.parties")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.parties.map((p, i) => (
                  <Badge
                    key={i}
                    variant="default"
                    className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)]"
                  >
                    {p.name}{" "}
                    <span className="ml-1 text-[color:var(--ds-text-muted)]">· {p.role}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Key Dates / Deadlines */}
          {(result.key_dates?.length || result.deadlines?.length) && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <CalendarClock size={14} /> {t("analyze.deadlines")}
              </h3>
              <div className="space-y-2">
                {(result.deadlines ?? result.key_dates ?? []).map((d, i) => {
                  const label = "what" in d ? d.what : d.label;
                  const urgency = "urgency" in d ? d.urgency : undefined;
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="whitespace-nowrap text-[color:var(--ds-text)] tabular-nums">
                        {formatDate(d.date)}
                      </span>
                      <span className="text-[color:var(--ds-text-muted)]">{label}</span>
                      {urgency === "critical" && (
                        <Badge
                          variant="default"
                          className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                        >
                          {t("analyze.critical")}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Issues */}
          {result.issues && result.issues.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <AlertTriangle size={14} /> {t("analyze.issues")} ({result.issues.length})
              </h3>
              <div className="space-y-3">
                {result.issues.map((issue, i) => (
                  <div key={i} className="border-l-2 border-[color:var(--ds-border)] pl-4">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge
                        variant="default"
                        className={cn(
                          "border text-xs",
                          SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.low
                        )}
                      >
                        {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                      </Badge>
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {issue.issue}
                      </span>
                    </div>
                    <p className="mb-1 text-sm text-[color:var(--ds-text-muted)]">
                      {issue.rationale}
                    </p>
                    <blockquote className="border-l-2 border-[color:var(--ds-border)] pl-3 text-xs text-[color:var(--ds-text-muted)] italic">
                      &ldquo;{issue.quote}&rdquo;
                    </blockquote>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Statutes */}
          {result.cited_statutes?.length || result.relevant_statutes?.length ? (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <Scale size={14} /> {t("analyze.statutes")}
              </h3>
              {result.cited_statutes && result.cited_statutes.length > 0 ? (
                <div className="space-y-1.5">
                  {result.cited_statutes.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="whitespace-nowrap text-[color:var(--ds-text)] tabular-nums">
                        {`§\u202F${String(s.paragraph).replace(/^§\s*/, "")} ${s.code}`}
                      </span>
                      {s.verified ? (
                        <CheckCircle2 size={13} className="text-[color:var(--ds-success-text)]" />
                      ) : (
                        <AlertTriangle size={13} className="text-[color:var(--ds-warning-text)]" />
                      )}
                      <span className="truncate text-xs text-[color:var(--ds-text-muted)]">
                        {s.context}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(result.relevant_statutes ?? []).map((s, i) => (
                    <Badge
                      key={i}
                      variant="default"
                      className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)]"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Citation Panel — unified grounding + AI Act badge (mandatory for every AI output) */}
          <CitationPanel
            data={{
              citations: (result.cited_statutes ?? []).map((s) => ({
                slug: `legal/norms/${s.code.toLowerCase()}/${s.paragraph}`,
                title: `${s.paragraph} ${s.code}`,
              })),
              grounding: result._grounding
                ? {
                    citations_verified: result._grounding.citations_verified,
                    citations_unverified: result._grounding.citations_unverified,
                    corpus_checked: result._grounding.corpus_checked,
                    grounded_citations: result._grounding.grounded_citations ?? [],
                    analyzed_at: result._grounding.analyzed_at,
                    has_unverified: result._grounding.has_unverified,
                    warning: result._grounding.warning,
                  }
                : clientGrounding,
              isStreaming: false,
            }}
          />

          {/* Actions */}
          {(result.action_items ?? result.recommended_actions ?? []).length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <ListChecks size={14} /> {t("analyze.actions")}
              </h3>
              <ul className="space-y-1.5">
                {(result.action_items ?? result.recommended_actions ?? []).map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-[color:var(--ds-text)]"
                  >
                    <ListChecks
                      size={13}
                      className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
                    />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
              <p className="mb-1 text-xs font-medium text-[color:var(--ds-warning-text)]">
                {t("analyze.warnings")}
              </p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-[color:var(--ds-warning-text)]">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
