"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Scale,
  ShieldAlert,
  FileText,
  Target,
  Save,
  Briefcase,
  Lightbulb,
  Gavel,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

type WizardStep = "select" | "analyze" | "strategy" | "drafts";

interface CaseOption {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  facts: string;
  claims: string[];
  defenses: string[];
  evidence: Array<{ id: string; title: string; description?: string }>;
  opponentName?: string;
  legalArea?: string;
}

interface StrategyResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  recommendedActions: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    rationale: string;
  }>;
  evidenceGaps: string[];
  riskAssessment: {
    overall: "low" | "medium" | "high";
    factors: string[];
  };
}

interface DraftSuggestion {
  type: string;
  title: string;
  outline: string;
  keyArguments: string[];
}

export default function ProcessStrategyPage() {
  const [step, setStep] = useState<WizardStep>("select");
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [loadingCases, setLoadingCases] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [_generatingStrategy, _setGeneratingStrategy] = useState(false);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<StrategyResult | null>(null);
  const [drafts, setDrafts] = useState<DraftSuggestion[]>([]);
  const [analysisText, setAnalysisText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    api.brain
      .listPages({ type: "legal_case", limit: 200 })
      .then((pages) => {
        const mapped = pages.map((p) => {
          const fm = caseFrontmatter(p);
          return {
            slug: p.slug,
            title: p.title,
            caseNumber: fm.case_number || p.slug,
            status: fm.status || "open",
            facts: p.content || "",
            claims: fm.claims || [],
            defenses: fm.defenses || [],
            evidence: (fm.evidence || []).map((e, idx) => ({
              id: String(idx),
              title: e.title || e.description || "",
              description: e.description,
            })),
            opponentName: fm.opponent_name,
            legalArea: fm.legal_area,
          };
        });
        setCases(mapped);
      })
      .catch(() => setCases([]))
      .finally(() => setLoadingCases(false));
  }, []);

  const selectedCase = cases.find((c) => c.slug === selectedSlug);

  const runAnalysis = useCallback(async () => {
    if (!selectedCase) return;
    setAnalyzing(true);
    setError(null);
    setAnalysisText("");
    try {
      const prompt = `Analysiere die folgende Akte strukturiert für die Prozessvorbereitung. Identifiziere Stärken, Schwächen, Chancen, Risiken (SWOT), Beweislücken und empfohlene nächste Schritte.

AKTE: ${selectedCase.title}
AKTENZEICHEN: ${selectedCase.caseNumber}
RECHTSGEBIET: ${selectedCase.legalArea || "nicht angegeben"}
GEGNER: ${selectedCase.opponentName || "nicht angegeben"}
STATUS: ${selectedCase.status}

SACHVERHALT:
${selectedCase.facts.slice(0, 3000)}

ANSRPÜCHE:
${selectedCase.claims.map((c) => `- ${c}`).join("\n") || "Keine erfasst"}

VERTEIDIGUNG:
${selectedCase.defenses.map((d) => `- ${d}`).join("\n") || "Keine erfasst"}

BEWEISMITTEL:
${selectedCase.evidence.map((e) => `- ${e.title}`).join("\n") || "Keine erfasst"}

Erstelle eine strukturierte Analyse im JSON-Format mit folgenden Feldern:
- summary: Kurzzusammenfassung der prozessualen Lage
- strengths: Array der Stärken unserer Seite
- weaknesses: Array der Schwächen unserer Seite
- opportunities: Array prozessualer Chancen
- threats: Array prozessualer Risiken
- recommendedActions: Array von {priority, action, rationale}
- evidenceGaps: Array identifizierter Beweislücken
- riskAssessment: {overall: "low"|"medium"|"high", factors: string[]}`;

      let accumulated = "";
      const result = await api.query.think(prompt, {
        mode: "balanced",
        onChunk: (chunk) => {
          accumulated += chunk;
          setAnalysisText(accumulated);
        },
      });

      // Try to parse JSON from the response
      const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as StrategyResult;
          setStrategy(parsed);
        } catch {
          // If JSON parse fails, use the text as summary
          setStrategy({
            summary: accumulated.slice(0, 500),
            strengths: [],
            weaknesses: [],
            opportunities: [],
            threats: [],
            recommendedActions: [],
            evidenceGaps: [],
            riskAssessment: { overall: "medium", factors: [] },
          });
        }
      } else {
        setStrategy({
          summary: result.answer?.slice(0, 500) || accumulated.slice(0, 500),
          strengths: [],
          weaknesses: [],
          opportunities: [],
          threats: [],
          recommendedActions: [],
          evidenceGaps: [],
          riskAssessment: { overall: "medium", factors: [] },
        });
      }
      setStep("strategy");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse fehlgeschlagen.");
    } finally {
      setAnalyzing(false);
    }
  }, [selectedCase]);

  const generateDrafts = useCallback(async () => {
    if (!selectedCase || !strategy) return;
    setGeneratingDrafts(true);
    setError(null);
    setDrafts([]);
    try {
      const prompt = `Basierend auf der folgenden Prozessstrategie, erstelle Entwürfe für die wichtigsten Schriftsätze.

AKTE: ${selectedCase.title} (${selectedCase.caseNumber})
GEGNER: ${selectedCase.opponentName || "nicht angegeben"}

STRATEGIE-ZUSAMMENFASSUNG:
${strategy.summary}

EMPFOHLENE AKTIONEN:
${strategy.recommendedActions.map((a) => `- [${a.priority}] ${a.action}: ${a.rationale}`).join("\n")}

STÄRKEN:
${strategy.strengths.map((s) => `- ${s}`).join("\n")}

SCHWÄCHEN:
${strategy.weaknesses.map((w) => `- ${w}`).join("\n")}

Erstelle 2-3 Schriftsatz-Entwürfe im JSON-Format als Array:
[{
  "type": "Klage" | "Klageerwiderung" | "Beweisantrag" | "Schriftsatz",
  "title": "Titel des Schriftsatzes",
  "outline": "Gliederung mit Hauptpunkten",
  "keyArguments": ["Argument 1", "Argument 2", ...]
}]`;

      let accumulated = "";
      await api.query.think(prompt, {
        mode: "balanced",
        onChunk: (chunk) => {
          accumulated += chunk;
        },
      });

      const jsonMatch = accumulated.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as DraftSuggestion[];
          setDrafts(parsed);
        } catch {
          setDrafts([
            {
              type: "Schriftsatz",
              title: "Generierter Entwurf",
              outline: accumulated.slice(0, 1000),
              keyArguments: [],
            },
          ]);
        }
      }
      setStep("drafts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Entwurf-Generierung fehlgeschlagen.");
    } finally {
      setGeneratingDrafts(false);
    }
  }, [selectedCase, strategy]);

  async function saveStrategyToCase() {
    if (!selectedCase || !strategy) return;
    setSaving(true);
    setSaveNotice(null);
    try {
      const page = await api.brain.getPage(selectedCase.slug);
      const fm = caseFrontmatter(page);
      await api.brain.updatePage({
        slug: selectedCase.slug,
        frontmatter: {
          ...fm,
          strategy: {
            summary: strategy.summary,
            strengths: strategy.strengths,
            weaknesses: strategy.weaknesses,
            opportunities: strategy.opportunities,
            threats: strategy.threats,
            recommendedActions: strategy.recommendedActions,
            evidenceGaps: strategy.evidenceGaps,
            riskAssessment: strategy.riskAssessment,
            generatedAt: new Date().toISOString(),
          },
        },
      });
      setSaveNotice("Strategie wurde in der Akte gespeichert.");
    } catch (e) {
      setSaveNotice(e instanceof Error ? `Fehler: ${e.message}` : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  const steps: Array<{ key: WizardStep; label: string; icon: React.ElementType }> = [
    { key: "select", label: "Akte wählen", icon: Briefcase },
    { key: "analyze", label: "Analyse", icon: Target },
    { key: "strategy", label: "Strategie", icon: Scale },
    { key: "drafts", label: "Schriftsätze", icon: FileText },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Prozessstrategie"
        description="Geführter Workflow: Akte analysieren → SWOT → Strategie → Schriftsatz-Entwürfe"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Prozessstrategie" }]}
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.key === step;
          const isDone = i < currentStepIndex;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <ArrowRight size={14} className="text-[color:var(--ds-text-muted)]" />}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "brand-bg text-white"
                    : isDone
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "text-[color:var(--ds-text-muted)]"
                )}
              >
                {isDone ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Step 1: Select Case */}
      {step === "select" && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="brand-text" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Akte auswählen</h2>
          </div>
          {loadingCases ? (
            <div className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
              <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
              Lade Akten…
            </div>
          ) : cases.length === 0 ? (
            <div className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
              Keine Akten gefunden. Bitte erst eine Akte anlegen.
            </div>
          ) : (
            <>
              <select
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              >
                <option value="">— Akte auswählen —</option>
                {cases.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.caseNumber} — {c.title} ({c.status})
                  </option>
                ))}
              </select>

              {selectedCase && (
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3 text-xs">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant="accent">{selectedCase.status}</Badge>
                    {selectedCase.legalArea && (
                      <Badge variant="default">{selectedCase.legalArea}</Badge>
                    )}
                    {selectedCase.opponentName && (
                      <Badge variant="default">Gegner: {selectedCase.opponentName}</Badge>
                    )}
                  </div>
                  <div className="text-[color:var(--ds-text-muted)]">
                    <strong className="text-[color:var(--ds-text)]">Ansprüche:</strong>{" "}
                    {selectedCase.claims.length} |{" "}
                    <strong className="text-[color:var(--ds-text)]">Verteidigung:</strong>{" "}
                    {selectedCase.defenses.length} |{" "}
                    <strong className="text-[color:var(--ds-text)]">Beweismittel:</strong>{" "}
                    {selectedCase.evidence.length}
                  </div>
                  {selectedCase.facts && (
                    <p className="mt-2 line-clamp-3 text-[color:var(--ds-text-muted)]">
                      {selectedCase.facts.slice(0, 300)}…
                    </p>
                  )}
                </div>
              )}

              <Button
                variant="primary"
                className="brand-bg w-full gap-2 text-white"
                disabled={!selectedSlug || analyzing}
                onClick={() => {
                  setStep("analyze");
                  runAnalysis();
                }}
              >
                {analyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analysiere Akte…
                  </>
                ) : (
                  <>
                    <Target size={16} />
                    Analyse starten
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Step 2: Analysis (streaming) */}
      {step === "analyze" && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <Target size={18} className="brand-text" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Akten-Analyse</h2>
            {analyzing && (
              <Loader2 size={14} className="animate-spin text-[color:var(--ds-text-muted)]" />
            )}
          </div>
          {analysisText ? (
            <div className="prose prose-sm max-w-none rounded-lg bg-[color:var(--ds-hover)] p-3 text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
              {analysisText}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
              Analyse läuft…
            </div>
          )}
          {!analyzing && strategy && (
            <Button
              variant="primary"
              className="brand-bg gap-2 text-white"
              onClick={() => setStep("strategy")}
            >
              <ArrowRight size={16} />
              Zur Strategie
            </Button>
          )}
        </div>
      )}

      {/* Step 3: Strategy */}
      {step === "strategy" && strategy && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Lightbulb size={18} className="brand-text" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                Strategie-Zusammenfassung
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              {strategy.summary}
            </p>
          </div>

          {/* Risk Assessment */}
          <div
            className={cn(
              "rounded-xl border p-4",
              strategy.riskAssessment.overall === "high"
                ? "border-red-500/20 bg-red-500/5"
                : strategy.riskAssessment.overall === "medium"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert
                size={18}
                className={cn(
                  strategy.riskAssessment.overall === "high"
                    ? "text-red-600"
                    : strategy.riskAssessment.overall === "medium"
                      ? "text-amber-600"
                      : "text-emerald-600"
                )}
              />
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                Risikobewertung:{" "}
                {strategy.riskAssessment.overall === "high"
                  ? "Hoch"
                  : strategy.riskAssessment.overall === "medium"
                    ? "Mittel"
                    : "Niedrig"}
              </h3>
            </div>
            {strategy.riskAssessment.factors.length > 0 && (
              <ul className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                {strategy.riskAssessment.factors.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            )}
          </div>

          {/* SWOT Grid */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SwotCard
              title="Stärken"
              items={strategy.strengths}
              color="emerald"
              icon={CheckCircle2}
            />
            <SwotCard
              title="Schwächen"
              items={strategy.weaknesses}
              color="red"
              icon={AlertTriangle}
            />
            <SwotCard title="Chancen" items={strategy.opportunities} color="blue" icon={Target} />
            <SwotCard title="Risiken" items={strategy.threats} color="amber" icon={ShieldAlert} />
          </div>

          {/* Recommended Actions */}
          {strategy.recommendedActions.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
                Empfohlene Maßnahmen
              </h3>
              <div className="space-y-2">
                {strategy.recommendedActions.map((action, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3"
                  >
                    <Badge
                      variant={action.priority === "high" ? "warning" : "default"}
                      className="shrink-0 text-xs"
                    >
                      {action.priority === "high"
                        ? "Hoch"
                        : action.priority === "medium"
                          ? "Mittel"
                          : "Niedrig"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[color:var(--ds-text)]">
                        {action.action}
                      </p>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {action.rationale}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Gaps */}
          {strategy.evidenceGaps.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-600">Beweislücken</h3>
              </div>
              <ul className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                {strategy.evidenceGaps.map((gap, i) => (
                  <li key={i}>• {gap}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              className="brand-bg gap-2 text-white"
              onClick={generateDrafts}
              disabled={generatingDrafts}
            >
              {generatingDrafts ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generiere Schriftsätze…
                </>
              ) : (
                <>
                  <FileText size={16} />
                  Schriftsatz-Entwürfe generieren
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="brand-border brand-text gap-2"
              onClick={saveStrategyToCase}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              In Akte speichern
            </Button>
            <Button
              variant="ghost"
              className="gap-2 text-[color:var(--ds-text-muted)]"
              onClick={() => {
                setStep("select");
                setStrategy(null);
                setAnalysisText("");
                setDrafts([]);
              }}
            >
              <ArrowLeft size={14} />
              Neue Akte
            </Button>
            {saveNotice && (
              <span
                className={cn(
                  "text-xs",
                  saveNotice.startsWith("Fehler:") ? "text-red-600" : "text-emerald-600"
                )}
              >
                {saveNotice}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Drafts */}
      {step === "drafts" && (
        <div className="space-y-4">
          {generatingDrafts && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center gap-2">
                <Loader2 size={18} className="brand-text animate-spin" />
                <span className="text-sm text-[color:var(--ds-text-muted)]">
                  Generiere Schriftsatz-Entwürfe basierend auf der Strategie…
                </span>
              </div>
            </div>
          )}

          {drafts.map((draft, i) => (
            <div
              key={i}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <Gavel size={18} className="brand-text" />
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">{draft.title}</h3>
                <Badge variant="accent" className="text-xs">
                  {draft.type}
                </Badge>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
                    Gliederung:
                  </p>
                  <pre className="rounded-lg bg-[color:var(--ds-hover)] p-3 text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                    {draft.outline}
                  </pre>
                </div>
                {draft.keyArguments.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
                      Schlüsselargumente:
                    </p>
                    <ul className="space-y-1 text-xs text-[color:var(--ds-text)]">
                      {draft.keyArguments.map((arg, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <ArrowRight
                            size={12}
                            className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
                          />
                          {arg}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="brand-border brand-text gap-2 text-xs"
                  onClick={() => {
                    const fullText = `${draft.title}\n\n${draft.outline}\n\nSchlüsselargumente:\n${draft.keyArguments.map((a) => `- ${a}`).join("\n")}`;
                    navigator.clipboard.writeText(fullText);
                  }}
                >
                  <FileText size={12} />
                  Kopieren
                </Button>
                <Link
                  href={`/dashboard/drafting`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-blue-600"
                >
                  <Pencil size={12} />
                  Im Drafting-Editor öffnen
                </Link>
              </div>
            </div>
          ))}

          {!generatingDrafts && drafts.length > 0 && (
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="gap-2 text-[color:var(--ds-text-muted)]"
                onClick={() => setStep("strategy")}
              >
                <ArrowLeft size={14} />
                Zurück zur Strategie
              </Button>
            </div>
          )}

          {!generatingDrafts && drafts.length === 0 && !error && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center text-sm text-[color:var(--ds-text-muted)]">
              Keine Entwürfe generiert. Bitte erneut versuchen.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwotCard({
  title,
  items,
  color,
  icon: Icon,
}: {
  title: string;
  items: string[];
  color: "emerald" | "red" | "blue" | "amber";
  icon: React.ElementType;
}) {
  const colorClasses: Record<string, string> = {
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600",
    red: "border-red-500/20 bg-red-500/5 text-red-600",
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-600",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-600",
  };

  return (
    <div className={cn("rounded-xl border p-4", colorClasses[color])}>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
          {items.map((item, i) => (
            <li key={i}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[color:var(--ds-text-muted)] italic">Keine identifiziert.</p>
      )}
    </div>
  );
}
