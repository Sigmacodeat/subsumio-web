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
        mode === "slug"
          ? { document_slug: slug.trim() }
          : { text: text.trim() },
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
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Dokument-Analyse"
        description="KI-gestüttes Issue-Spotting mit Corpus-Grounding — erkennt Parteien, Fristen, Risiken und zitiert nur verifizierte Normen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Dokument-Analyse" }]}
      />

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("slug")}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            mode === "slug"
              ? "brand-soft brand-text border brand-border"
              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] border border-transparent",
          )}
        >
          Aus Vault (Slug)
        </button>
        <button
          onClick={() => setMode("text")}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            mode === "text"
              ? "brand-soft brand-text border brand-border"
              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] border border-transparent",
          )}
        >
          Direkter Text
        </button>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        {mode === "slug" ? (
          <div>
            <label htmlFor="analyze-slug" className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold">
              Dokument-Slug
            </label>
            <Input
              id="analyze-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="z. B. mietvertrag-mueller-2026"
              className="mt-1.5 bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)]"
            />
            <p className="text-xs text-[color:var(--ds-text-muted)] mt-1.5">
              Das Dokument muss im Brain hochgeladen sein. Die Analyse wird mit verifizierten Normen aus dem Law-Corpus grounded.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="analyze-text" className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold">
              Dokumenttext
            </label>
            <textarea
              id="analyze-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Dokumenttext hier einfügen…"
              className="w-full h-48 mt-1.5 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-4 py-3 text-sm text-[color:var(--ds-text)] font-mono leading-relaxed focus:outline-none focus:border-emerald-500/50 resize-none"
            />
          </div>
        )}
        <Button onClick={run} disabled={loading || !canRun} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />}
          Analysieren
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs brand-soft brand-text border brand-border">
                    {result.document_type}
                  </Badge>
                  {result.type_confidence !== undefined && (
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      Konfidenz: {Math.round(result.type_confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-sm text-[color:var(--ds-text)] mt-2">{result.summary}</p>
              </div>
              {result.attorney_review_required && (
                <Badge variant="default" className="text-xs bg-amber-500/10 border-amber-500/20 text-amber-600 shrink-0">
                  Anwaltliche Prüfung erforderlich
                </Badge>
              )}
            </div>
          </div>

          {/* Parties */}
          {result.parties.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold mb-3 flex items-center gap-2">
                <Users size={14} /> Beteiligte
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.parties.map((p, i) => (
                  <Badge key={i} variant="default" className="text-xs bg-[color:var(--ds-hover)] border-[color:var(--ds-border)] text-[color:var(--ds-text)]">
                    {p.name} <span className="text-[color:var(--ds-text-muted)] ml-1">· {p.role}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Key Dates / Deadlines */}
          {(result.key_dates?.length || result.deadlines?.length) && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold mb-3 flex items-center gap-2">
                <CalendarClock size={14} /> Fristen & Daten
              </h3>
              <div className="space-y-2">
                {(result.deadlines ?? result.key_dates ?? []).map((d, i) => {
                  const label = "what" in d ? d.what : d.label;
                  const urgency = "urgency" in d ? d.urgency : undefined;
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="font-mono text-[color:var(--ds-text)] whitespace-nowrap">{d.date}</span>
                      <span className="text-[color:var(--ds-text-muted)]">{label}</span>
                      {urgency === "critical" && (
                        <Badge variant="default" className="text-xs bg-red-500/10 border-red-500/20 text-red-600">Kritisch</Badge>
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
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle size={14} /> Issues ({result.issues.length})
              </h3>
              <div className="space-y-3">
                {result.issues.map((issue, i) => (
                  <div key={i} className="border-l-2 border-[color:var(--ds-border)] pl-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="default" className={cn("text-xs border", SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.low)}>
                        {issue.severity}
                      </Badge>
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">{issue.issue}</span>
                    </div>
                    <p className="text-sm text-[color:var(--ds-text-muted)] mb-1">{issue.rationale}</p>
                    <blockquote className="text-xs text-[color:var(--ds-text-muted)] italic border-l-2 border-[color:var(--ds-border)] pl-3">
                      &ldquo;{issue.quote}&rdquo;
                    </blockquote>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Statutes */}
          {(result.cited_statutes?.length || result.relevant_statutes?.length) ? (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold mb-3 flex items-center gap-2">
                <Scale size={14} /> Normen
              </h3>
              {result.cited_statutes && result.cited_statutes.length > 0 ? (
                <div className="space-y-1.5">
                  {result.cited_statutes.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-[color:var(--ds-text)]">§ {s.paragraph} {s.code}</span>
                      {s.verified ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <AlertTriangle size={13} className="text-amber-600" />
                      )}
                      <span className="text-xs text-[color:var(--ds-text-muted)] truncate">{s.context}</span>
                    </div>
                  ))}
                  {result._grounding && (
                    <p className="text-xs text-[color:var(--ds-text-muted)] mt-2">
                      Corpus-Grounding: {result._grounding.citations_verified} verifiziert, {result._grounding.citations_unverified} nicht im Corpus gefunden.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(result.relevant_statutes ?? []).map((s, i) => (
                    <Badge key={i} variant="default" className="text-xs bg-[color:var(--ds-hover)] border-[color:var(--ds-border)] text-[color:var(--ds-text)]">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Actions */}
          {(result.action_items ?? result.recommended_actions ?? []).length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold mb-3 flex items-center gap-2">
                <ListChecks size={14} /> Empfohlene nächste Schritte
              </h3>
              <ul className="space-y-1.5">
                {(result.action_items ?? result.recommended_actions ?? []).map((a, i) => (
                  <li key={i} className="text-sm text-[color:var(--ds-text)] flex items-start gap-2">
                    <Sparkles size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-600 font-medium mb-1">Hinweise</p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600/80">{w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
