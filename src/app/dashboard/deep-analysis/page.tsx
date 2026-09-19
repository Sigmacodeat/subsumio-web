"use client";

import { useState } from "react";
import { useLang } from "@/lib/use-lang";
import {
  FileSearch,
  Loader2,
  AlertCircle,
  FileText,
  AlertTriangle,
  TrendingUp,
  Quote,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { csrfFetch } from "@/lib/csrf";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { DocumentPicker, type PickedDocument } from "@/components/legal/document-picker";
import { SaveToMatterButton } from "@/components/legal/save-to-matter-button";

interface DeepAnalysisCitation {
  slug: string;
  title: string;
  quote: string;
}

interface DeepAnalysisFinding {
  theme: string;
  description: string;
  risk_level: "low" | "medium" | "high" | "critical";
  affected_documents: string[];
  citations: DeepAnalysisCitation[];
}

interface DeepAnalysisReport {
  executive_summary: string;
  document_count: number;
  findings: DeepAnalysisFinding[];
  cross_document_patterns: string[];
  overall_risk: "low" | "medium" | "high" | "critical";
  warnings: string[];
  attorney_review_required: true;
}

const riskColors: Record<string, string> = {
  low: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  medium: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  high: "bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
  critical: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
};

const RISK_LABELS: Record<string, string> = {
  low: "Gering",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

/** A document reference for display: the cited title if known, else a readable slug tail. */
function docLabel(slug: string, titles: Map<string, string>): string {
  const title = titles.get(slug);
  if (title) return title;
  const tail = slug.split("/").pop() ?? slug;
  return tail.replace(/[-_]+/g, " ");
}

const riskBorder: Record<string, string> = {
  low: "border-l-[color:var(--ds-success-solid)]",
  medium: "border-l-[color:var(--ds-warning-solid)]",
  high: "border-l-[color:var(--ds-attention-solid)]",
  critical: "border-l-[color:var(--ds-danger-solid)]",
};

/** The report as Markdown, for filing in the matter. */
function reportMarkdown(report: DeepAnalysisReport, docs: PickedDocument[]): string {
  const titles = new Map(docs.map((d) => [d.slug, d.name]));
  const lines = [
    `**Gesamtrisiko:** ${RISK_LABELS[report.overall_risk] ?? report.overall_risk} · ${report.document_count} Dokumente`,
    "",
    "## Zusammenfassung",
    report.executive_summary,
  ];
  if (report.findings.length) {
    lines.push("", "## Befunde");
    for (const f of report.findings) {
      lines.push(
        "",
        `### ${f.theme} (${RISK_LABELS[f.risk_level] ?? f.risk_level})`,
        f.description,
        f.affected_documents.length
          ? `Betroffen: ${f.affected_documents.map((s) => docLabel(s, titles)).join(", ")}`
          : ""
      );
    }
  }
  if (report.cross_document_patterns.length) {
    lines.push("", "## Dokumentübergreifende Muster", ...report.cross_document_patterns.map((p) => `- ${p}`));
  }
  if (report.warnings.length) {
    lines.push("", "## Hinweise", ...report.warnings.map((w) => `- ${w}`));
  }
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export default function DeepAnalysisPage() {
  const { t } = useLang();
  const [report, setReport] = useState<DeepAnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<PickedDocument[]>([]);
  const [caseSlug, setCaseSlug] = useState("");
  const [prompt, setPrompt] = useState("");
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());
  const {
    grounding: reportGrounding,
    isGrounding: isGroundingReport,
    groundAnswer: groundReport,
  } = useGroundedAnswer();

  const run = async () => {
    const slugList = docs.map((d) => d.slug);
    if (slugList.length === 0) return;

    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await csrfFetch("/api/legal/deep-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugs: slugList,
          ...(prompt ? { prompt } : {}),
        }),
      });
      if (!res.ok) {
        setError(
          res.status === 404
            ? "Mindestens ein Dokument wurde nicht gefunden. Bitte prüfen Sie die Kennungen."
            : res.status === 400
              ? "Bitte prüfen Sie die Eingabe: 1 bis 25 Dokumentkennungen."
              : "Die Analyse ist gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut."
        );
        return;
      }
      const json = await res.json();
      const data = json.data ?? json;
      setReport(data);
      const groundingText = [
        data.executive_summary,
        ...data.findings.map((f: DeepAnalysisFinding) => f.description),
        ...data.cross_document_patterns,
      ].join("\n\n");
      groundReport(groundingText).catch(() => {});
    } catch {
      setError(
        "Die Analyse ist gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut."
      );
    } finally {
      setLoading(false);
    }
  };

  const docTitles = new Map<string, string>(
    (report?.findings ?? []).flatMap((f) =>
      f.citations.filter((c) => c.title).map((c) => [c.slug, c.title] as [string, string])
    )
  );

  const toggleFinding = (i: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("deep_analysis.title")}
        description={t("deep_analysis.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("deep_analysis.title") },
        ]}
      />

      {/* Input Form */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <DocumentPicker
              id="deep-analysis-docs"
              selected={docs}
              onChange={setDocs}
              onCaseChange={setCaseSlug}
              max={25}
              disabled={loading}
            />
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Maximal 25 Dokumente pro Analyse.
            </p>
          </div>
          <div>
            <label htmlFor="deep-analysis-focus" className="mb-1.5 block text-sm font-medium">
              Analyse-Fokus (optional)
            </label>
            <Input
              id="deep-analysis-focus"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="z. B. Welche Haftungsrisiken bestehen dokumentübergreifend?"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={run} disabled={loading || docs.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Wird analysiert…
                </>
              ) : (
                <>
                  <FileSearch className="mr-1.5 h-4 w-4" />
                  Analyse starten
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4">
          <div className="flex items-center gap-2 text-sm text-[color:var(--ds-danger-text)]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </Card>
      )}

      {report && (
        <>
          {/* Warnings */}
          {report.warnings.length > 0 && (
            <Card className="border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--ds-warning-text)]" />
                <div className="text-sm">
                  <p className="font-medium text-[color:var(--ds-warning-text)]">Hinweise</p>
                  <ul className="mt-1 space-y-1 text-[color:var(--ds-warning-text)]">
                    {report.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* Summary */}
          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="h-5 w-5" />
                Zusammenfassung
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="default" className={riskColors[report.overall_risk]}>
                  Gesamtrisiko: {RISK_LABELS[report.overall_risk] ?? report.overall_risk}
                </Badge>
                <Badge variant="default">{report.document_count} Dokumente</Badge>
                <SaveToMatterButton
                  source="deep_analysis"
                  defaultCase={caseSlug}
                  defaultTitle="Tiefenanalyse"
                  content={reportMarkdown(report, docs)}
                  citations={reportGrounding?.grounded_citations}
                />
              </div>
            </div>
            <p className="text-sm leading-relaxed">{report.executive_summary}</p>
            <div className="mt-4">
              <CitationPanel
                data={
                  {
                    grounding: reportGrounding ?? null,
                    citations: report.findings.flatMap((f) =>
                      f.citations.map((c) => ({ slug: c.slug, title: c.title || c.slug }))
                    ),
                    isStreaming: isGroundingReport,
                  } satisfies CitationPanelData
                }
                compact
              />
            </div>
          </Card>

          {/* Cross-Document Patterns */}
          {report.cross_document_patterns.length > 0 && (
            <Card className="p-6">
              <h2 className="mb-3 text-lg font-semibold">Übergreifende Muster</h2>
              <ul className="space-y-2">
                {report.cross_document_patterns.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-[color:var(--ds-text-muted)]">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Findings */}
          {report.findings.length > 0 && (
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Befunde ({report.findings.length})</h2>
              <div className="space-y-3">
                {report.findings.map((finding, i) => {
                  const expanded = expandedFindings.has(i);
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border border-l-4 border-[color:var(--ds-border)] ${riskBorder[finding.risk_level]} overflow-hidden`}
                    >
                      <button
                        onClick={() => toggleFinding(i)}
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--ds-text-muted)]" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ds-text-muted)]" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{finding.theme}</p>
                            <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                              {finding.affected_documents.length === 1
                                ? "1 Dokument betroffen"
                                : `${finding.affected_documents.length} Dokumente betroffen`}
                            </p>
                          </div>
                        </div>
                        <Badge variant="default" className={riskColors[finding.risk_level]}>
                          {RISK_LABELS[finding.risk_level] ?? finding.risk_level}
                        </Badge>
                      </button>
                      {expanded && (
                        <div className="border-t border-[color:var(--ds-border)] p-4">
                          <p className="text-sm leading-relaxed">{finding.description}</p>

                          {finding.affected_documents.length > 0 && (
                            <div className="mt-3">
                              <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
                                Betroffene Dokumente:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {finding.affected_documents.map((slug, j) => (
                                  <Badge key={j} variant="default" className="text-xs">
                                    <FileText className="mr-1 h-3 w-3" />
                                    {docLabel(slug, docTitles)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {finding.citations.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                                Belege:
                              </p>
                              {finding.citations.map((citation, j) => (
                                <div
                                  key={j}
                                  className="rounded-md bg-[color:var(--ds-surface-2)] p-3"
                                >
                                  <div className="mb-1 flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                                    <Quote className="h-3 w-3" />
                                    {citation.title || docLabel(citation.slug, docTitles)}
                                  </div>
                                  <p className="text-sm italic">&ldquo;{citation.quote}&rdquo;</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

    </div>
  );
}
