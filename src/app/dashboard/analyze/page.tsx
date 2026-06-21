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
  Sparkles,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { DocumentAnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { CitationPanel } from "@/components/legal/CitationPanel";

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
};

export default function AnalyzePage() {
  const [slug, setSlug] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"slug" | "text">("slug");
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.analyzeDocument(
        mode === "slug" ? { document_slug: slug.trim() } : { text: text.trim() }
      );
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  const canRun = mode === "slug" ? slug.trim().length > 0 : text.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Dokument-Analyse"
        description="KI-gestütztes Issue-Spotting mit Quellenprüfung — erkennt Parteien, Fristen, Risiken und zitiert nur verifizierte Normen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Dokument-Analyse" }]}
      />

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("slug")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            mode === "slug"
              ? "brand-soft brand-text brand-border border"
              : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
          )}
        >
          Aus Vault (Slug)
        </button>
        <button
          onClick={() => setMode("text")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            mode === "text"
              ? "brand-soft brand-text brand-border border"
              : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
          )}
        >
          Direkter Text
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
              Dokument-Slug
            </label>
            <Input
              id="analyze-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="z. B. mietvertrag-mueller-2026"
              className="mt-1.5 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]"
            />
            <p className="mt-1.5 text-xs text-[color:var(--ds-text-muted)]">
              Das Dokument muss im Brain hochgeladen sein. Die Analyse wird mit verifizierten Normen
              aus dem Law-Corpus grounded.
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="analyze-text"
              className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase"
            >
              Dokumenttext
            </label>
            <textarea
              id="analyze-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Dokumenttext hier einfügen…"
              className="mt-1.5 h-48 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        )}
        <Button
          onClick={run}
          disabled={loading || !canRun}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />}
          Analysieren
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
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
                  <Badge
                    variant="default"
                    className="brand-soft brand-text brand-border border text-xs"
                  >
                    {result.document_type}
                  </Badge>
                  {result.type_confidence !== undefined && (
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      Konfidenz: {Math.round(result.type_confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[color:var(--ds-text)]">{result.summary}</p>
              </div>
              {result.attorney_review_required && (
                <Badge
                  variant="default"
                  className="shrink-0 border-amber-500/20 bg-amber-500/10 text-xs text-amber-600"
                >
                  Anwaltliche Prüfung erforderlich
                </Badge>
              )}
            </div>
          </div>

          {/* Parties */}
          {result.parties.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <Users size={14} /> Beteiligte
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
                <CalendarClock size={14} /> Fristen & Daten
              </h3>
              <div className="space-y-2">
                {(result.deadlines ?? result.key_dates ?? []).map((d, i) => {
                  const label = "what" in d ? d.what : d.label;
                  const urgency = "urgency" in d ? d.urgency : undefined;
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="font-mono whitespace-nowrap text-[color:var(--ds-text)]">
                        {d.date}
                      </span>
                      <span className="text-[color:var(--ds-text-muted)]">{label}</span>
                      {urgency === "critical" && (
                        <Badge
                          variant="default"
                          className="border-red-500/20 bg-red-500/10 text-xs text-red-600"
                        >
                          Kritisch
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
                <AlertTriangle size={14} /> Issues ({result.issues.length})
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
                        {issue.severity}
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
                <Scale size={14} /> Normen
              </h3>
              {result.cited_statutes && result.cited_statutes.length > 0 ? (
                <div className="space-y-1.5">
                  {result.cited_statutes.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-[color:var(--ds-text)]">
                        § {s.paragraph} {s.code}
                      </span>
                      {s.verified ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <AlertTriangle size={13} className="text-amber-600" />
                      )}
                      <span className="truncate text-xs text-[color:var(--ds-text-muted)]">
                        {s.context}
                      </span>
                    </div>
                  ))}
                  {result._grounding && (
                    <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
                      Corpus-Grounding: {result._grounding.citations_verified} verifiziert,{" "}
                      {result._grounding.citations_unverified} nicht im Corpus gefunden.
                    </p>
                  )}
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

          {/* Citation Panel — unified grounding + AI Act badge */}
          {result._grounding && (
            <CitationPanel
              data={{
                grounding: {
                  citations_verified: result._grounding.citations_verified,
                  citations_unverified: result._grounding.citations_unverified,
                  corpus_checked: result._grounding.corpus_checked,
                  grounded_citations: [],
                  analyzed_at: result._grounding.analyzed_at,
                },
                isStreaming: false,
              }}
            />
          )}

          {/* Actions */}
          {(result.action_items ?? result.recommended_actions ?? []).length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <ListChecks size={14} /> Empfohlene nächste Schritte
              </h3>
              <ul className="space-y-1.5">
                {(result.action_items ?? result.recommended_actions ?? []).map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-[color:var(--ds-text)]"
                  >
                    <Sparkles size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="mb-1 text-xs font-medium text-amber-600">Hinweise</p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600/80">
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
