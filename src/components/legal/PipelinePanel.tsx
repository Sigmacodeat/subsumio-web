"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Table,
  PenTool,
  Gavel,
  ChevronDown,
  ChevronRight,
  Activity,
  Play,
  Users,
  AlertTriangle,
  AlertCircle,
  Link2,
  Network,
  TrendingUp,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";
import type { BrainPage } from "@/lib/types";
import { DraftEditor, type DraftInfo } from "./DraftEditor";

interface PipelinePanelProps {
  caseSlug: string;
  caseTitle?: string;
  kanzleiName?: string;
  recipientEmail?: string;
  recipientName?: string;
}

interface CrossCaseFinding {
  type: string;
  severity: string;
  description: string;
  case_a: string;
  case_b: string;
  entity_name?: string;
}

interface EnsembleConsensus {
  total_score: number;
  recommendation: string;
  narrative_coherence_score?: number;
  central_thesis?: string;
  coherence_violations?: string[];
}

interface EnsembleVerdict {
  consensus: EnsembleConsensus;
}

interface PipelineState {
  case_slug: string;
  status: string;
  current_layer: number;
  layers: Record<
    number,
    {
      status: string;
      started_at?: string;
      completed_at?: string;
      output_slugs?: string[];
      error?: string;
    }
  >;
  linked_cases?: string[];
  cross_case_findings?: CrossCaseFinding[];
  damage_overlap_warnings?: string[];
  ensemble_verdict?: EnsembleVerdict;
  warnings?: string[];
  contradiction_findings?: number;
  cost_spent_usd?: number;
  total_duration_ms?: number;
  guardrail_results?: Record<
    number,
    {
      passed: boolean;
      flags_count: number;
      flag_types: string[];
      regenerated: boolean;
      regen_passed?: boolean;
    }
  >;
  cross_verify_results?: {
    clean: boolean;
    flags_count: number;
    flag_types: string[];
    regenerated: boolean;
    regen_clean?: boolean;
  };
}

// Corrected against the actual backend bucket assignments in
// server/src/core/minions/handlers/legal-pipeline.ts (state.layers[N].output_slugs
// writes). The backend groups many specialist sub-analyses into the SAME numeric
// bucket (e.g. bucket 4 alone holds 7 distinct analyses) — the label here now names
// the bucket's real scope instead of a single (previously wrong) sub-analysis name,
// and SUB_TYPE_LABELS below renders each individual page with its own label so nothing
// hides behind a generic bucket name.
const LAYER_INFO: Array<{
  num: number;
  name: string;
  icon: typeof FileText;
}> = [
  { num: 1, name: "ON-Scanner", icon: FileText },
  { num: 2, name: "Entity-Extractor", icon: Users },
  { num: 3, name: "Forensic Analyst", icon: Gavel },
  { num: 4, name: "Rechtliche Tiefenanalyse", icon: Scale },
  { num: 5, name: "Schaden, Fristen & Prozessrisiko", icon: Table },
  { num: 6, name: "Schriftsatz & Gegenargumente", icon: PenTool },
];

/** Per-page-type label shown on each output card, so a page is self-explanatory
 * regardless of which numeric bucket the backend filed it under. */
const SUB_TYPE_LABELS: Record<string, string> = {
  on_index: "ON-Index",
  person: "Entität",
  completeness_check: "Vollständigkeitsprüfung",
  forensic_report: "Forensische Analyse",
  legal_grounding_map: "Rechtsgrundlagen (§-Retrieval)",
  precedent_match: "Präzedenzfälle (OGH/BGH/BVerfG)",
  burden_of_proof: "Beweislastverteilung",
  admissibility_check: "Zulässigkeitsprüfung",
  subsumption_check: "Subsumtion (Obersatz → Schluss)",
  fact_gap_analysis: "Sachverhaltslücken",
  witness_expert_analysis: "Zeugen & Gutachter",
  evidence_quality_analysis: "Beweiskraft-Bewertung",
  damage_table: "Schadenstabelle",
  deadline_calendar: "Fristenkalender",
  deadline_validation: "Fristenprüfung (§-Cross-Check)",
  cost_benefit: "Kosten-Nutzen-Analyse",
  settlement_analysis: "Vergleichsanalyse (BATNA/ZOPA)",
  enforcement_analysis: "Vollstreckungsanalyse",
  appeal_risk_analysis: "Berufungsrisiko",
  procedural_strategy: "Verfahrensstrategie",
  insurance_coverage: "Versicherungsdeckung",
  tax_impact_analysis: "Steuerliche Auswirkung",
  counterclaim_risk_analysis: "Widerklagerisiko",
  mediation_adr_analysis: "Mediation/Schlichtung",
  limitation_scan_analysis: "Verjährungs-Scan",
  cost_award_analysis: "Kostenentscheidung",
  legal_draft: "Schriftsatz-Entwurf",
  counter_arguments: "Gegenargumente (Opponent-Simulation)",
  quality_audit: "Qualitätsprüfung",
};

function subTypeLabel(type: unknown): string | null {
  if (typeof type !== "string" || !type) return null;
  return SUB_TYPE_LABELS[type] ?? null;
}

function layerStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-[color:var(--ds-success-text)]";
    case "running":
      return "text-[color:var(--ds-info-text)]";
    case "failed":
      return "text-[color:var(--ds-danger-text)]";
    case "pending":
      return "text-[color:var(--ds-text-muted)]";
    default:
      return "text-[color:var(--ds-text-muted)]";
  }
}

function layerStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "running":
      return Loader2;
    case "failed":
      return XCircle;
    case "pending":
      return Clock;
    default:
      return Clock;
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Specialized renderers for legal pipeline output pages ────────────────
// These parse the JSON content written by the pipeline layers and render
// it in a structured, anwalt-friendly way — instead of raw JSON dumps.

interface MatchedParagraph {
  paragraph?: string;
  statute?: string;
  source_text?: string;
  confidence?: string;
  verified?: boolean;
  source_slug?: string;
}

interface LegalGroundingEntry {
  finding?: string;
  finding_type?: string;
  on_reference?: string;
  quote?: string;
  matched_paragraphs?: MatchedParagraph[];
}

/** Renders legal_grounding_map pages — shows each finding with its matched
 * §§ including the wörtliche Gesetzestext (source_text). This is the critical
 * view for an anwalt to verify the subsumption: they see the §-text right
 * next to the finding, not just "§ 1311 ABGB" as a label. */
function LegalGroundingRenderer({ content }: { content: string }) {
  let entries: LegalGroundingEntry[] = [];
  try {
    const parsed = JSON.parse(content);
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    return <pre className="font-sans text-xs whitespace-pre-wrap">{content}</pre>;
  }
  if (entries.length === 0) {
    return (
      <p className="text-xs text-[color:var(--ds-text-muted)]">Keine Rechtsgrundlagen gefunden.</p>
    );
  }
  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="rounded border border-[color:var(--ds-border)] p-2">
          <div className="mb-1 flex items-center gap-2">
            <Badge
              variant="default"
              className="border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-glow)] text-xs text-[color:var(--brand-primary)]"
            >
              {entry.finding_type ?? "Finding"}
            </Badge>
            <span className="text-xs font-medium text-[color:var(--ds-text)]">
              {entry.finding ?? ""}
            </span>
          </div>
          {entry.quote && (
            <p className="mb-2 text-xs text-[color:var(--ds-text-muted)] italic">
              „{entry.quote.slice(0, 200)}
              {entry.quote.length > 200 ? "…" : ""}&ldquo;
            </p>
          )}
          {entry.matched_paragraphs && entry.matched_paragraphs.length > 0 && (
            <div className="space-y-2">
              {entry.matched_paragraphs.map((mp, j) => (
                <div
                  key={j}
                  className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-[color:var(--brand-primary)]">
                      {mp.paragraph ?? "?"} {mp.statute ?? ""}
                    </span>
                    {mp.verified && (
                      <Badge
                        variant="default"
                        className="border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[10px] text-[color:var(--ds-success-text)]"
                      >
                        ✓ Verifiziert
                      </Badge>
                    )}
                    {mp.confidence && (
                      <span className="text-[10px] text-[color:var(--ds-text-muted)]">
                        Konfidenz: {mp.confidence}
                      </span>
                    )}
                  </div>
                  {mp.source_text && (
                    <p className="text-xs leading-relaxed text-[color:var(--ds-text)]">
                      {mp.source_text.slice(0, 500)}
                      {mp.source_text.length > 500 ? "…" : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface CompletenessPiece {
  role?: string;
  status?: string;
  severity?: string;
  rationale?: string;
  arrivedCount?: number;
  expectedCount?: number;
  matchedSlugs?: string[];
}

/** Renders completeness_check pages — shows the verdict prominently and
 * lists each expected document piece with its status (OK/MISSING/EXPIRED). */
function CompletenessCheckRenderer({
  content,
  frontmatter,
}: {
  content: string;
  frontmatter: Record<string, unknown>;
}) {
  let pieces: CompletenessPiece[] = [];
  try {
    const parsed = JSON.parse(content);
    pieces = Array.isArray(parsed?.pieces) ? parsed.pieces : [];
  } catch {
    return <pre className="font-sans text-xs whitespace-pre-wrap">{content}</pre>;
  }
  const verdict = String(frontmatter.verdict ?? "—");
  const percent = Number(frontmatter.completeness_percent ?? 0);
  const verdictColor =
    verdict === "COMPLETE"
      ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
      : verdict === "CHASE"
        ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
        : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Badge variant="default" className={cn("border text-sm font-semibold", verdictColor)}>
          {verdict === "COMPLETE"
            ? "✓ Vollständig"
            : verdict === "CHASE"
              ? "⚠ Dokumente anfordern"
              : "⛔ Unvollständig"}
        </Badge>
        <span className="text-sm font-semibold text-[color:var(--ds-text)]">
          {percent}% vollständig
        </span>
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          Fall-Typ: {String(frontmatter.case_type ?? "—")}
        </span>
      </div>
      {pieces.length > 0 && (
        <div className="space-y-1">
          {pieces.map((piece, i) => {
            const statusColor =
              piece.status === "OK"
                ? "text-[color:var(--ds-success-text)]"
                : piece.status === "MISSING"
                  ? "text-[color:var(--ds-warning-text)]"
                  : piece.status === "EXPIRED"
                    ? "text-[color:var(--ds-danger-text)]"
                    : "text-[color:var(--ds-text-muted)]";
            return (
              <div
                key={i}
                className="flex items-start gap-2 rounded border border-[color:var(--ds-border)] p-2"
              >
                <span className={cn("text-xs font-semibold", statusColor)}>
                  {piece.status === "OK"
                    ? "✓"
                    : piece.status === "MISSING"
                      ? "✗"
                      : piece.status === "EXPIRED"
                        ? "⏰"
                        : "?"}
                </span>
                <div className="flex-1">
                  <div className="text-xs font-medium text-[color:var(--ds-text)]">
                    {piece.role ?? "Dokument"} ({piece.arrivedCount ?? 0}/{piece.expectedCount ?? 1}
                    )
                  </div>
                  {piece.rationale && (
                    <div className="text-[10px] text-[color:var(--ds-text-muted)]">
                      {piece.rationale}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SubsumptionStep {
  step?: string;
  label?: string;
  text?: string;
  merkmale?: string[];
  conclusion?: string;
  confidence?: number;
  abstain?: boolean;
  reason?: string;
}

/** Renders subsumption_check pages — shows the 4-step BenGER scaffold
 * (Obersatz → Definition → Subsumtion → Schluss) in a structured way.
 * Handles both JSON format (from our new subsumption.ts module) and
 * markdown text format (from the existing subsumption-checker specialist). */
function SubsumptionRenderer({ content }: { content: string }) {
  let steps: SubsumptionStep[] = [];
  let abstain = false;
  let isJson = false;
  try {
    const parsed = JSON.parse(content);
    isJson = true;
    abstain = parsed?.abstain === true;
    steps = Array.isArray(parsed?.steps) ? parsed.steps : Array.isArray(parsed) ? parsed : [];
  } catch {
    // Not JSON — fall through to markdown rendering
  }
  if (abstain) {
    return (
      <div className="rounded border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
        <p className="text-sm font-semibold text-[color:var(--ds-warning-text)]">
          ⚠ Subsumtion nicht möglich
        </p>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Der Sachverhalt ist unvollständig für eine zuverlässige Subsumtion. Weitere Fakten
          erforderlich.
        </p>
      </div>
    );
  }
  // If not JSON or no steps parsed, render as formatted text (the existing
  // subsumption-checker writes markdown with a code block — display it nicely)
  if (!isJson || steps.length === 0) {
    // Strip markdown code fences for cleaner display
    const cleanText = content
      .replace(/^```\w*\n?/gm, "")
      .replace(/\n```$/gm, "")
      .trim();
    return (
      <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
        {cleanText}
      </pre>
    );
  }
  const stepLabels: Record<string, string> = {
    obersatz: "Obersatz",
    definition: "Definition",
    subsumtion: "Subsumtion",
    schluss: "Schluss",
  };
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="rounded border border-[color:var(--ds-border)] p-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-[color:var(--brand-primary)]">
              {stepLabels[step.step ?? ""] ?? step.label ?? `Schritt ${i + 1}`}
            </span>
            {typeof step.confidence === "number" && (
              <span className="text-[10px] text-[color:var(--ds-text-muted)]">
                Konfidenz: {(step.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {step.text && (
            <p className="text-xs leading-relaxed text-[color:var(--ds-text)]">{step.text}</p>
          )}
          {step.merkmale && step.merkmale.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-[color:var(--ds-text-muted)]">
              {step.merkmale.map((m, j) => (
                <li key={j}>{m}</li>
              ))}
            </ul>
          )}
          {step.conclusion && (
            <p className="mt-1 text-xs font-semibold text-[color:var(--ds-text)]">
              → {step.conclusion}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function PipelinePanel({
  caseSlug,
  caseTitle,
  kanzleiName,
  recipientEmail,
  recipientName,
}: PipelinePanelProps) {
  const { addToast } = useToast();
  const [expandedLayer, setExpandedLayer] = useState<number | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [showPartyCorrection, setShowPartyCorrection] = useState(false);
  const [partyOverrides, setPartyOverrides] = useState<
    Array<{ name: string; role: string; corrected: boolean }>
  >([]);
  const [showCrossCase, setShowCrossCase] = useState(false);
  const [showDamageOverlaps, setShowDamageOverlaps] = useState(false);
  const [showOnGraph, setShowOnGraph] = useState(false);
  const [showCoherence, setShowCoherence] = useState(false);
  const [showLimitationScan, setShowLimitationScan] = useState(false);

  // G11 fix: replace raw useEffect fetch with useQuery for caching, retry,
  // error state, and AbortController cleanup. Pre-fix, errors were only
  // console.error'd and requests could setState after unmount.
  const {
    data,
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["legal", "pipeline", caseSlug],
    queryFn: async () => {
      const stateSlug = `pipeline/state-${caseSlug}`;
      let statePage: BrainPage | null = null;
      try {
        statePage = await api.brain.getPage(stateSlug);
      } catch {
        // No pipeline state yet
      }

      if (!statePage) {
        return {
          pipelineState: null,
          outputPages: {} as Record<string, BrainPage>,
          drafts: [] as DraftInfo[],
        };
      }

      const fm = (statePage.frontmatter ?? {}) as Record<string, unknown>;
      const state: PipelineState = {
        case_slug: caseSlug,
        status: String(fm.status ?? "unknown"),
        current_layer: Number(fm.current_layer ?? 0),
        layers: {},
      };
      try {
        const raw = statePage.content || "";
        const parsed = JSON.parse(raw) as PipelineState;
        if (parsed.layers) state.layers = parsed.layers;
        if (parsed.linked_cases) state.linked_cases = parsed.linked_cases;
        if (parsed.cross_case_findings) state.cross_case_findings = parsed.cross_case_findings;
        if (parsed.damage_overlap_warnings)
          state.damage_overlap_warnings = parsed.damage_overlap_warnings;
        if (parsed.ensemble_verdict) state.ensemble_verdict = parsed.ensemble_verdict;
        if (parsed.warnings) state.warnings = parsed.warnings;
        if (typeof parsed.contradiction_findings === "number")
          state.contradiction_findings = parsed.contradiction_findings;
        if (typeof parsed.cost_spent_usd === "number") state.cost_spent_usd = parsed.cost_spent_usd;
        if (typeof parsed.total_duration_ms === "number")
          state.total_duration_ms = parsed.total_duration_ms;
      } catch {
        // Fallback: derive from frontmatter
      }

      // Fetch all output pages
      const allSlugs: string[] = [];
      for (const layer of Object.values(state.layers)) {
        if (layer.output_slugs) allSlugs.push(...layer.output_slugs);
      }
      let outputPages: Record<string, BrainPage> = {};
      const drafts: DraftInfo[] = [];
      if (allSlugs.length > 0) {
        outputPages = await api.brain.getPages(allSlugs);
        for (const [slug, page] of Object.entries(outputPages)) {
          const pfm = (page.frontmatter ?? {}) as Record<string, unknown>;
          if (pfm.type === "legal_draft") {
            drafts.push({
              slug,
              title: page.title,
              draftType: String(pfm.draft_type ?? ""),
              status: String(pfm.status ?? "draft"),
              content: page.content || "",
              attorneyReviewRequired: pfm.attorney_review_required === true,
              caseRef: String(pfm.case_ref ?? caseSlug),
              frontmatter: pfm,
            });
          }
        }
      }
      return { pipelineState: state, outputPages, drafts };
    },
    refetchInterval: 10_000, // auto-refresh every 10s for live pipeline updates
  });

  const pipelineState = data?.pipelineState ?? null;
  const outputPages = data?.outputPages ?? {};
  const drafts = data?.drafts ?? [];

  // Continuous polling while pipeline is running
  // G11 fix: useQuery already handles auto-refresh via refetchInterval.
  // The old manual polling interval is removed — useQuery does this better.

  // Fetch entities for party correction
  useEffect(() => {
    if (!showPartyCorrection) return;
    (async () => {
      try {
        const pages = await api.brain.listPages({ type: "person", limit: 100 });
        const entities = pages
          .filter((p) => {
            const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
            return fm.case_ref === caseSlug;
          })
          .map((p) => {
            const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
            return {
              name: String(fm.name ?? p.title ?? ""),
              role: String(fm.role ?? ""),
              corrected: false,
            };
          });
        setPartyOverrides(entities);
      } catch {
        // best effort
      }
    })();
  }, [showPartyCorrection, caseSlug]);

  const handleTriggerPipeline = useCallback(async () => {
    setTriggering(true);
    try {
      // Get all documents of this case
      const casePage = await api.brain.getPage(caseSlug);
      const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
      const documents = (fm.documents as Array<Record<string, unknown>>) ?? [];
      const partSlugs = documents.map((d) => String(d.slug ?? "")).filter(Boolean);

      if (partSlugs.length === 0) {
        addToast({
          type: "error",
          title: "Keine Dokumente",
          description: "Diese Akte hat keine verknüpften Dokumente für die Pipeline.",
          duration: 4000,
        });
        return;
      }

      // Trigger via the dashboard API (which proxies to the engine)
      const res = await csrfFetch("/api/legal/trigger-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: caseSlug,
          part_slugs: partSlugs,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }

      addToast({
        type: "success",
        title: "Pipeline gestartet",
        description: "Die Multi-Layer Legal Agent Pipeline wurde gestartet.",
        duration: 4000,
      });

      // Start polling for state updates
      setTimeout(() => refetch(), 3000);
    } catch (err) {
      addToast({
        type: "error",
        title: "Pipeline-Start fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        duration: 5000,
      });
    } finally {
      setTriggering(false);
    }
  }, [caseSlug, addToast, refetch]);

  const handleResumePipeline = useCallback(
    async (fromLayer: number) => {
      try {
        // Transform party overrides from array format to engine's expected
        // { client?, opponent?, focus? } format
        const corrected = partyOverrides.filter((p) => p.corrected);
        const overrides: Record<string, string> = {};
        for (const p of corrected) {
          if (p.role === "mandant") overrides.client = p.name;
          else if (p.role === "gegner") overrides.opponent = p.name;
        }

        const res = await csrfFetch("/api/legal/trigger-pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_slug: caseSlug,
            resume_from_layer: fromLayer,
            manual_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || data.error || `HTTP ${res.status}`);
        }

        addToast({
          type: "success",
          title: "Pipeline fortgesetzt",
          description: `Pipeline wird ab Layer ${fromLayer} fortgesetzt.`,
          duration: 4000,
        });
        setShowPartyCorrection(false);
        setTimeout(() => refetch(), 3000);
      } catch (err) {
        addToast({
          type: "error",
          title: "Resume fehlgeschlagen",
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
          duration: 5000,
        });
      }
    },
    [caseSlug, partyOverrides, addToast, refetch]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  const hasPipeline = pipelineState !== null;
  const pipelineStatus = pipelineState?.status ?? "not_started";
  const _isRunning = pipelineStatus === "running";

  // Limitation Scanner (Layer 5l, Verjährung) result — surfaced as its own alert
  // instead of being buried, unlabeled, inside the generic "bucket 5" output list.
  // A missed limitation period is one of the highest-stakes findings the pipeline
  // can produce, so it gets the same prominence as the deadline/damage-overlap panels.
  const limitationScanPage = Object.values(outputPages).find(
    (p) =>
      (p.frontmatter as Record<string, unknown> | undefined)?.type === "limitation_scan_analysis"
  );
  const limitationFm = (limitationScanPage?.frontmatter ?? {}) as Record<string, unknown>;
  const limitationUrgentCount = Number(limitationFm.urgent_count ?? 0);
  const limitationExpiredCount = Number(limitationFm.verjaehrte_count ?? 0);
  const limitationRiskScore =
    typeof limitationFm.verjaehrung_risiko_score === "number"
      ? limitationFm.verjaehrung_risiko_score
      : undefined;
  const limitationUrgentClaims = Array.isArray(limitationFm.urgent_ansprueche)
    ? (limitationFm.urgent_ansprueche as Array<Record<string, unknown>>)
    : [];
  const limitationExpiredClaims = Array.isArray(limitationFm.verjaehrte_ansprueche)
    ? (limitationFm.verjaehrte_ansprueche as Array<Record<string, unknown>>)
    : [];
  const hasLimitationAlert = limitationUrgentCount > 0 || limitationExpiredCount > 0;

  return (
    <div className="space-y-4">
      {/* Pipeline Status Header */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity size={18} className="brand-text" />
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                Legal Agent Pipeline
              </h3>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Multi-Layer: ON-Scanner → Entity → Forensic → Rechtliche Tiefenanalyse →
                Schaden/Fristen/Risiko → Schriftsatz → Critic
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="default"
              className={cn(
                "border text-xs",
                pipelineStatus === "completed"
                  ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                  : pipelineStatus === "running"
                    ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                    : pipelineStatus === "failed"
                      ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
              )}
            >
              {pipelineStatus === "not_started"
                ? "Nicht gestartet"
                : pipelineStatus === "running"
                  ? "Läuft..."
                  : pipelineStatus === "completed"
                    ? "Abgeschlossen"
                    : pipelineStatus === "failed"
                      ? "Fehlgeschlagen"
                      : pipelineStatus}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => refetch()}
            >
              <RefreshCw size={12} />
              Aktualisieren
            </Button>
            {!hasPipeline && (
              <Button
                variant="primary"
                size="sm"
                className="brand-bg gap-1.5 text-xs text-white"
                disabled={triggering}
                onClick={handleTriggerPipeline}
              >
                {triggering ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Pipeline starten
              </Button>
            )}
          </div>
        </div>

        {/* Layer Progress Bar */}
        {hasPipeline && (
          <div className="mt-4 space-y-1.5">
            {LAYER_INFO.map((layer) => {
              const layerState = pipelineState!.layers[layer.num];
              const status = layerState?.status ?? "pending";
              const StatusIcon = layerStatusIcon(status);
              const Icon = layer.icon;
              const hasOutput = layerState?.output_slugs && layerState.output_slugs.length > 0;
              return (
                <div key={layer.num}>
                  <button
                    onClick={() => setExpandedLayer(expandedLayer === layer.num ? null : layer.num)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      expandedLayer === layer.num
                        ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-hover)]"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] hover:bg-[color:var(--ds-hover)]"
                    )}
                  >
                    {expandedLayer === layer.num ? (
                      <ChevronDown
                        size={14}
                        className="shrink-0 text-[color:var(--ds-text-muted)]"
                      />
                    ) : (
                      <ChevronRight
                        size={14}
                        className="shrink-0 text-[color:var(--ds-text-muted)]"
                      />
                    )}
                    <Icon size={14} className={cn("shrink-0", layerStatusColor(status))} />
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      Layer {layer.num}: {layer.name}
                    </span>
                    <StatusIcon
                      size={12}
                      className={cn(
                        "ml-auto shrink-0",
                        layerStatusColor(status),
                        status === "running" && "animate-spin"
                      )}
                    />
                    {hasOutput && (
                      <Badge
                        variant="default"
                        className="ml-1 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                      >
                        {layerState!.output_slugs!.length}
                      </Badge>
                    )}
                    {pipelineState?.guardrail_results?.[layer.num] && (
                      <Badge
                        variant="default"
                        className={cn(
                          "ml-1 border text-xs",
                          pipelineState.guardrail_results[layer.num]!.passed
                            ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                            : "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]"
                        )}
                        title={`Guardrail: ${pipelineState.guardrail_results[layer.num]!.flag_types.join(", ") || "no flags"}`}
                      >
                        {pipelineState.guardrail_results[layer.num]!.passed
                          ? "✓ Guardrail"
                          : `⚠ ${pipelineState.guardrail_results[layer.num]!.flags_count} Flag${pipelineState.guardrail_results[layer.num]!.flags_count > 1 ? "s" : ""}`}
                      </Badge>
                    )}
                    {layer.num === 6 && pipelineState?.cross_verify_results && (
                      <Badge
                        variant="default"
                        className={cn(
                          "ml-1 border text-xs",
                          pipelineState.cross_verify_results.clean
                            ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                            : "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]"
                        )}
                        title={`Cross-verify: ${pipelineState.cross_verify_results.flag_types.join(", ") || "clean"}`}
                      >
                        {pipelineState.cross_verify_results.clean
                          ? "✓ Cross-Verify"
                          : `⚠ Cross-Verify (${pipelineState.cross_verify_results.flags_count})`}
                      </Badge>
                    )}
                    {layerState?.completed_at && (
                      <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
                        {fmtDate(layerState.completed_at)}
                      </span>
                    )}
                  </button>

                  {/* Expanded layer content */}
                  {expandedLayer === layer.num && hasOutput && (
                    <div className="mt-1 space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-3">
                      {layerState!.output_slugs!.map((slug) => {
                        const page = outputPages[slug];
                        if (!page) return null;
                        const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
                        const isDraft = fm.type === "legal_draft";
                        if (isDraft) return null; // Drafts are shown separately below

                        return (
                          <div
                            key={slug}
                            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                                {page.title}
                              </span>
                              {subTypeLabel(fm.type) && (
                                <Badge
                                  variant="default"
                                  className="border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-glow)] text-xs text-[color:var(--brand-primary)]"
                                >
                                  {subTypeLabel(fm.type)}
                                </Badge>
                              )}
                              {fm.total_score !== undefined && (
                                <Badge
                                  variant="default"
                                  className={cn(
                                    "border text-xs",
                                    Number(fm.total_score) >= 70
                                      ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                                      : Number(fm.total_score) >= 50
                                        ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                                        : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                                  )}
                                >
                                  Score: {String(fm.total_score)}
                                </Badge>
                              )}
                              {typeof fm.recommendation === "string" && fm.recommendation && (
                                <Badge
                                  variant="default"
                                  className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                                >
                                  {fm.recommendation}
                                </Badge>
                              )}
                            </div>
                            <div className="max-h-[300px] overflow-y-auto rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-2">
                              {fm.type === "legal_grounding_map" && page.content ? (
                                <LegalGroundingRenderer content={page.content} />
                              ) : fm.type === "completeness_check" && page.content ? (
                                <CompletenessCheckRenderer
                                  content={page.content}
                                  frontmatter={fm}
                                />
                              ) : fm.type === "subsumption_check" && page.content ? (
                                <SubsumptionRenderer content={page.content} />
                              ) : (
                                <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                                  {page.content || ""}
                                </pre>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Party correction UI for Layer 2 */}
                      {layer.num === 2 && (
                        <div className="mt-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                              Mandant/Gegner-Korrektur
                            </span>
                            {!showPartyCorrection ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs"
                                onClick={() => setShowPartyCorrection(true)}
                              >
                                Rollen korrigieren
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                size="sm"
                                className="brand-bg gap-1.5 text-xs text-white"
                                onClick={() => handleResumePipeline(3)}
                              >
                                <Play size={12} />
                                Resume ab Layer 3
                              </Button>
                            )}
                          </div>
                          {showPartyCorrection && partyOverrides.length > 0 && (
                            <div className="space-y-1.5">
                              {partyOverrides.map((entity, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-1.5"
                                >
                                  <span className="text-xs text-[color:var(--ds-text)]">
                                    {entity.name}
                                  </span>
                                  <select
                                    value={entity.role}
                                    onChange={(e) => {
                                      const updated = [...partyOverrides];
                                      updated[i] = {
                                        ...entity,
                                        role: e.target.value,
                                        corrected: true,
                                      };
                                      setPartyOverrides(updated);
                                    }}
                                    className="ml-auto rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                                  >
                                    <option value="mandant">Mandant</option>
                                    <option value="gegner">Gegner</option>
                                    <option value="zeuge">Zeuge</option>
                                    <option value="richter">Richter</option>
                                    <option value="gutachter">Gutachter</option>
                                    <option value="other">Sonstige</option>
                                  </select>
                                </div>
                              ))}
                              <p className="text-xs text-[color:var(--ds-text-muted)]">
                                Nach Korrektur wird die Pipeline ab Layer 3 (Forensic Analyst) mit
                                den korrigierten Rollen fortgesetzt.
                              </p>
                            </div>
                          )}
                          {showPartyCorrection && partyOverrides.length === 0 && (
                            <p className="text-xs text-[color:var(--ds-text-muted)]">
                              Keine Entitäten gefunden.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {expandedLayer === layer.num && !hasOutput && (
                    <div className="mt-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-3 text-xs text-[color:var(--ds-text-muted)]">
                      Keine Output-Pages für diesen Layer.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cross-Case Analysis Panel */}
      {pipelineState?.linked_cases && pipelineState.linked_cases.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link2 size={18} className="text-[color:var(--ds-info-text)]" />
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Cross-Case Analyse
                </h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {pipelineState.linked_cases.length} verknüpfte(s) Verfahren ·{" "}
                  {pipelineState.cross_case_findings?.length ?? 0} Finding(s)
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowCrossCase(!showCrossCase)}
            >
              {showCrossCase ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showCrossCase ? "Ausblenden" : "Anzeigen"}
            </Button>
          </div>

          {showCrossCase && (
            <div className="mt-3 space-y-3">
              {/* Linked Cases */}
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-3">
                <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                  Verknüpfte Verfahren
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pipelineState.linked_cases.map((lc) => (
                    <Badge
                      key={lc}
                      variant="default"
                      className="border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-xs text-[color:var(--ds-info-text)]"
                    >
                      <Link2 size={10} className="mr-1" />
                      {lc}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Cross-Case Findings */}
              {pipelineState.cross_case_findings && pipelineState.cross_case_findings.length > 0 ? (
                <div className="space-y-2">
                  {pipelineState.cross_case_findings.map((finding, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border p-3",
                        finding.severity === "high"
                          ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
                          : finding.severity === "medium"
                            ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
                            : "border-[color:var(--ds-border)] bg-[color:var(--ds-bg)]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          size={14}
                          className={cn(
                            "shrink-0",
                            finding.severity === "high"
                              ? "text-[color:var(--ds-danger-text)]"
                              : finding.severity === "medium"
                                ? "text-[color:var(--ds-warning-text)]"
                                : "text-[color:var(--ds-text-muted)]"
                          )}
                        />
                        <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                          {finding.type === "role_conflict"
                            ? "Rollenkonflikt"
                            : finding.type === "accusation_contradiction"
                              ? "Vorwurfswiderspruch"
                              : finding.type === "mandate_conflict"
                                ? "Mandatskonflikt"
                                : finding.type}
                        </span>
                        <Badge
                          variant="default"
                          className={cn(
                            "ml-auto border text-xs",
                            finding.severity === "high"
                              ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                              : finding.severity === "medium"
                                ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                                : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                          )}
                        >
                          {finding.severity}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-[color:var(--ds-text)]">
                        {finding.description}
                      </p>
                      {finding.entity_name && (
                        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                          Person: <span className="font-medium">{finding.entity_name}</span>
                        </p>
                      )}
                      <div className="mt-1 flex gap-2 text-xs text-[color:var(--ds-text-muted)]">
                        <span>{finding.case_a}</span>
                        <span>↔</span>
                        <span>{finding.case_b}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Keine Cross-Case-Konflikte gefunden.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Damage Overlap Warnings Panel */}
      {pipelineState?.damage_overlap_warnings &&
        pipelineState.damage_overlap_warnings.length > 0 && (
          <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-[color:var(--ds-warning-text)]" />
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    Schadens-Doppelzählungs-Warnungen
                  </h3>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {pipelineState.damage_overlap_warnings.length} mögliche Doppelzählung(en)
                    erkannt
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowDamageOverlaps(!showDamageOverlaps)}
              >
                {showDamageOverlaps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {showDamageOverlaps ? "Ausblenden" : "Anzeigen"}
              </Button>
            </div>

            {showDamageOverlaps && (
              <div className="mt-3 space-y-2">
                {pipelineState.damage_overlap_warnings.map((warning, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        size={14}
                        className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                      />
                      <p className="text-xs leading-relaxed text-[color:var(--ds-text)]">
                        {warning}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {/* Verjährungs-Scan Alert Panel (Layer 5l Limitation Scanner) */}
      {hasLimitationAlert && (
        <div
          className={cn(
            "rounded-xl border p-4",
            limitationExpiredCount > 0
              ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
              : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle
                size={18}
                className={
                  limitationExpiredCount > 0
                    ? "text-[color:var(--ds-danger-text)]"
                    : "text-[color:var(--ds-warning-text)]"
                }
              />
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Verjährungs-Scan
                </h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {limitationExpiredCount > 0 &&
                    `${limitationExpiredCount} verjährte(r) Anspruch/Ansprüche · `}
                  {limitationUrgentCount > 0 &&
                    `${limitationUrgentCount} dringende(r) Anspruch/Ansprüche vor Verjährung`}
                  {limitationRiskScore !== undefined &&
                    ` · Risiko-Score: ${limitationRiskScore}/100`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {limitationExpiredCount > 0 && (
                <Badge
                  variant="default"
                  className="border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                >
                  ⛔ {limitationExpiredCount} verjährt
                </Badge>
              )}
              {limitationUrgentCount > 0 && (
                <Badge
                  variant="default"
                  className="border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-xs text-[color:var(--ds-warning-text)]"
                >
                  🚨 {limitationUrgentCount} dringend
                </Badge>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowLimitationScan(!showLimitationScan)}
              >
                {showLimitationScan ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {showLimitationScan ? "Ausblenden" : "Details"}
              </Button>
            </div>
          </div>

          {showLimitationScan && (
            <div className="mt-3 space-y-2">
              {limitationExpiredClaims.map((claim, i) => (
                <div
                  key={`expired-${i}`}
                  className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]"
                    />
                    <div className="text-xs leading-relaxed text-[color:var(--ds-text)]">
                      <span className="font-semibold">{String(claim.anspruch ?? "Anspruch")}</span>
                      {claim.gegner ? ` gegen ${String(claim.gegner)}` : ""} — bereits verjährt
                      {claim.paragraph ? ` (${String(claim.paragraph)})` : ""}
                      {claim.grund ? `: ${String(claim.grund)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {limitationUrgentClaims.map((claim, i) => (
                <div
                  key={`urgent-${i}`}
                  className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                    />
                    <div className="text-xs leading-relaxed text-[color:var(--ds-text)]">
                      <span className="font-semibold">{String(claim.anspruch ?? "Anspruch")}</span>
                      {claim.gegner ? ` gegen ${String(claim.gegner)}` : ""} — noch{" "}
                      {String(claim.restzeit_tage ?? "?")} Tage
                      {claim.paragraph ? ` (${String(claim.paragraph)})` : ""}
                      {claim.handlungsbedarf ? `: ${String(claim.handlungsbedarf)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {limitationExpiredClaims.length === 0 && limitationUrgentClaims.length === 0 && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Details nicht verfügbar — vollständigen Verjährungs-Scan im Layer-5-Output öffnen.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ON-Querverweis-Graph Panel */}
      {pipelineState?.layers?.[1]?.output_slugs &&
        pipelineState.layers[1].output_slugs.length > 0 && (
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Network size={18} className="text-purple-600" />
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    ON-Querverweis-Graph
                  </h3>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    Querverweise zwischen ON-Nummern
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowOnGraph(!showOnGraph)}
              >
                {showOnGraph ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {showOnGraph ? "Ausblenden" : "Anzeigen"}
              </Button>
            </div>

            {showOnGraph && (
              <div className="mt-3">
                {(() => {
                  const onSlug = pipelineState.layers[1].output_slugs![0];
                  const onPage = outputPages[onSlug];
                  if (!onPage || !onPage.content) {
                    return (
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        ON-Index nicht verfügbar.
                      </p>
                    );
                  }
                  // Parse ON references from the page content
                  const refSection = onPage.content.match(/## ON-Querverweise[\s\S]*$/);
                  if (!refSection) {
                    return (
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        Keine Querverweise in der ON-Tabelle gefunden.
                      </p>
                    );
                  }
                  const refLines = refSection[0]
                    .split("\n")
                    .filter(
                      (l) => l.startsWith("| ") && !l.includes("---") && !l.includes("ON-Nummer")
                    );
                  const refs = refLines
                    .map((line) => {
                      const cells = line
                        .split("|")
                        .map((c) => c.trim())
                        .filter(Boolean);
                      return { on: cells[0] ?? "", references: cells[1] ?? "" };
                    })
                    .filter((r) => r.on && r.references && r.references !== "—");

                  if (refs.length === 0) {
                    return (
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        Keine ON-Querverweise in diesem Fall.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {refs.map((ref, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-2.5 py-1.5"
                          >
                            <span className="font-mono text-xs font-semibold text-purple-600">
                              {ref.on}
                            </span>
                            <ChevronRight size={10} className="text-[color:var(--ds-text-muted)]" />
                            <span className="text-xs text-[color:var(--ds-text)]">
                              {ref.references}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

      {/* Narrative Coherence Panel */}
      {pipelineState?.ensemble_verdict?.consensus && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Scale size={18} className="text-indigo-600" />
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Narrative Kohärenz (Ensemble Critic)
                </h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {pipelineState.ensemble_verdict.consensus.central_thesis
                    ? `Zentrale These: ${pipelineState.ensemble_verdict.consensus.central_thesis.slice(0, 80)}...`
                    : "Keine zentrale These erfasst"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {typeof pipelineState.ensemble_verdict.consensus.narrative_coherence_score ===
                "number" && (
                <Badge
                  variant="default"
                  className={cn(
                    "border text-xs",
                    pipelineState.ensemble_verdict.consensus.narrative_coherence_score >= 70
                      ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                      : pipelineState.ensemble_verdict.consensus.narrative_coherence_score >= 50
                        ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                        : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                  )}
                >
                  <TrendingUp size={10} className="mr-1" />
                  Kohärenz: {pipelineState.ensemble_verdict.consensus.narrative_coherence_score}
                </Badge>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowCoherence(!showCoherence)}
              >
                {showCoherence ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {showCoherence ? "Ausblenden" : "Anzeigen"}
              </Button>
            </div>
          </div>

          {showCoherence && (
            <div className="mt-3 space-y-3">
              {pipelineState.ensemble_verdict.consensus.central_thesis && (
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
                  <span className="text-xs font-semibold text-indigo-600">Zentrale These</span>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text)]">
                    {pipelineState.ensemble_verdict.consensus.central_thesis}
                  </p>
                </div>
              )}

              {pipelineState.ensemble_verdict.consensus.coherence_violations &&
              pipelineState.ensemble_verdict.consensus.coherence_violations.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-[color:var(--ds-text)]">
                    Kohärenz-Verletzungen (
                    {pipelineState.ensemble_verdict.consensus.coherence_violations.length})
                  </span>
                  {pipelineState.ensemble_verdict.consensus.coherence_violations.map((v, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          size={12}
                          className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                        />
                        <p className="text-xs leading-relaxed text-[color:var(--ds-text)]">{v}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Keine Kohärenz-Verletzungen. Alle Layer-Outputs folgen derselben zentralen These.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pipeline Warnings Summary */}
      {pipelineState?.warnings && pipelineState.warnings.length > 0 && (
        <div className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-[color:var(--ds-warning-text)]" />
            <span className="text-xs font-semibold text-[color:var(--ds-text)]">
              Pipeline-Warnings ({pipelineState.warnings.length})
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {pipelineState.warnings.map((w, i) => (
              <li key={i} className="text-xs text-[color:var(--ds-text-muted)]">
                · {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Legal Drafts with Editor */}
      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <PenTool size={16} className="brand-text" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Schriftsatz-Entwürfe ({drafts.length})
            </h3>
          </div>
          {drafts.map((draft) => (
            <DraftEditor
              key={draft.slug}
              draft={draft}
              caseSlug={caseSlug}
              caseTitle={caseTitle}
              kanzleiName={kanzleiName}
              recipientEmail={recipientEmail}
              recipientName={recipientName}
              onSaved={refetch}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {/* G11 fix: Error state — previously errors were only console.error'd */}
      {isError && !loading && (
        <div className="rounded-xl border border-[color:var(--ds-danger)] bg-[color:var(--ds-surface)] p-6 text-center">
          <AlertCircle size={28} className="mx-auto mb-3 text-[color:var(--ds-danger)]" />
          <p className="text-sm text-[color:var(--ds-text)]">
            Pipeline-Daten konnten nicht geladen werden.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[color:var(--brand-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            <RefreshCw size={14} />
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasPipeline && !loading && !isError && (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8 text-center">
          <Activity size={32} className="mx-auto mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Die Legal Agent Pipeline wurde für diese Akte noch nicht gestartet.
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Klicke auf &quot;Pipeline starten&quot;, um die automatische Fallaufarbeitung zu
            beginnen.
          </p>
        </div>
      )}
    </div>
  );
}
