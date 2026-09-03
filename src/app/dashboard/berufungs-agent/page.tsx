"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Scale, FileText, Target, PenTool, Swords, Download } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { BerufungsAgentStepper } from "@/components/legal/berufungs-agent/Stepper";
import { ActAnalysisStep } from "@/components/legal/berufungs-agent/ActAnalysisStep";
import { BerufungsgruendeStep } from "@/components/legal/berufungs-agent/BerufungsgruendeStep";
import { EntwurfStep } from "@/components/legal/berufungs-agent/EntwurfStep";
import { OpponentStep } from "@/components/legal/berufungs-agent/OpponentStep";
import { ExportStep } from "@/components/legal/berufungs-agent/ExportStep";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export interface BerufungsGrund {
  id: string;
  titel: string;
  beschreibung: string;
  erfolgsprognose: 1 | 2 | 3 | 4 | 5;
  label: "stark" | "mittel" | "schwach";
  quelle?: string;
  selected: boolean;
  manuell?: boolean;
}

export interface OpponentFinding {
  argument: string;
  severity: "kritisch" | "mittel" | "niedrig";
  gegenargument: string;
  empfehlung: string;
}

export interface ActAnalysis {
  summary: string;
  recommended: string;
  recommendedApproach: string;
  risks: Array<{
    description: string;
    probability: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
    mitigation: string;
  }>;
  next_steps: string[];
  success_probability: number;
  cost_estimate?: {
    min: number;
    max: number;
    currency: string;
    basis: string;
  };
}

const STEPS = [
  { id: 1, label: "Akt-Analyse", icon: FileText },
  { id: 2, label: "Berufungsgründe", icon: Target },
  { id: 3, label: "Entwurf", icon: PenTool },
  { id: 4, label: "Gegner-Simulation", icon: Swords },
  { id: 5, label: "Export", icon: Download },
] as const;

export default function BerufungsAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [caseSlug, setCaseSlug] = useState<string>(searchParams.get("case") ?? "");
  const [step, setStep] = useState<number>(
    Math.max(1, Math.min(5, Number(searchParams.get("step") ?? "1")))
  );

  // Shared state across steps
  const [analysis, setAnalysis] = useState<ActAnalysis | null>(null);
  const [berufungsgruende, setBerufungsgruende] = useState<BerufungsGrund[]>([]);
  const [draftContent, setDraftContent] = useState<string>("");
  const [draftSlug, setDraftSlug] = useState<string>("");
  const [opponentFindings, setOpponentFindings] = useState<OpponentFinding[]>([]);

  // Restore saved gruende order from case frontmatter when gründe are loaded
  // (e.g. after generating gründe, then reloading the page). The order was
  // persisted by the drag-reorder feature via /api/legal/reorder-gruende.
  useEffect(() => {
    if (!caseSlug || berufungsgruende.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await api.brain.getPage(caseSlug);
        if (cancelled || !page.frontmatter) return;
        const savedOrder = page.frontmatter.berufungsgruende_order;
        if (!Array.isArray(savedOrder) || savedOrder.length === 0) return;
        // Re-sort gründe according to the saved order. Any gründe not in the
        // saved order (e.g. newly added after the last reorder) keep their
        // relative positions at the end.
        const orderIndex = new Map(savedOrder.map((id, i) => [String(id), i]));
        setBerufungsgruende((prev) => {
          const sorted = [...prev].sort((a, b) => {
            const ai = orderIndex.get(a.id);
            const bi = orderIndex.get(b.id);
            if (ai === undefined && bi === undefined) return 0;
            if (ai === undefined) return 1;
            if (bi === undefined) return -1;
            return ai - bi;
          });
          // Only update if order actually changed
          const changed = sorted.some((g, i) => g.id !== prev[i]?.id);
          return changed ? sorted : prev;
        });
      } catch {
        // Best-effort — if the case page doesn't exist yet, no order to restore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseSlug, berufungsgruende.length]);

  const updateUrl = useCallback(
    (newStep: number, newCase?: string) => {
      const params = new URLSearchParams();
      const c = newCase ?? caseSlug;
      if (c) params.set("case", c);
      params.set("step", String(newStep));
      router.replace(`/dashboard/berufungs-agent?${params.toString()}`, { scroll: false });
    },
    [caseSlug, router]
  );

  const goToStep = useCallback(
    (newStep: number) => {
      if (newStep < 1 || newStep > 5) return;
      setStep(newStep);
      updateUrl(newStep);
    },
    [updateUrl]
  );

  const handleCaseSelect = useCallback(
    (slug: string) => {
      setCaseSlug(slug);
      // Reset state when case changes
      setAnalysis(null);
      setBerufungsgruende([]);
      setDraftContent("");
      setDraftSlug("");
      setOpponentFindings([]);
      updateUrl(1, slug);
      setStep(1);
    },
    [updateUrl]
  );

  const handleNext = useCallback(() => goToStep(step + 1), [goToStep, step]);
  const handleBack = useCallback(() => goToStep(step - 1), [goToStep, step]);

  const selectedGruende = useMemo(
    () => berufungsgruende.filter((g) => g.selected),
    [berufungsgruende]
  );

  const canProceed = useMemo(() => {
    if (step === 1) return Boolean(caseSlug && analysis);
    if (step === 2) return selectedGruende.length > 0;
    if (step === 3) return draftContent.trim().length > 0;
    if (step === 4) return true; // optional step
    return true;
  }, [step, caseSlug, analysis, selectedGruende, draftContent]);

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        title="Berufungs-Agent"
        description="Geführter Workflow für Berufung, Revision und Beschwerde — mit Quellenverifikation und Opponent-Simulator."
        breadcrumbs={[
          { label: "Kanzlei-Cockpit", href: "/dashboard" },
          { label: "Berufungs-Agent" },
        ]}
        actions={
          <div className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
            <Scale className="h-4 w-4" />
            <span>Rechtsmittel-Workflow</span>
          </div>
        }
      />

      <div className="container mx-auto max-w-6xl px-4 py-6">
        <BerufungsAgentStepper
          steps={STEPS}
          currentStep={step}
          onStepClick={(s) => {
            // Allow going back to completed steps, forward only if canProceed
            if (s <= step) goToStep(s);
            else if (s === step + 1 && canProceed) goToStep(s);
          }}
        />

        <div className="mt-6 min-h-[500px] rounded-lg border bg-[color:var(--ds-surface)] p-6">
          {step === 1 && (
            <ActAnalysisStep
              caseSlug={caseSlug}
              onCaseSelect={handleCaseSelect}
              analysis={analysis}
              onAnalysisComplete={setAnalysis}
              onNext={handleNext}
              canProceed={canProceed}
            />
          )}
          {step === 2 && (
            <BerufungsgruendeStep
              caseSlug={caseSlug}
              analysis={analysis}
              berufungsgruende={berufungsgruende}
              onGruendeChange={setBerufungsgruende}
              onNext={handleNext}
              onBack={handleBack}
              canProceed={canProceed}
            />
          )}
          {step === 3 && (
            <EntwurfStep
              caseSlug={caseSlug}
              selectedGruende={selectedGruende}
              draftContent={draftContent}
              onDraftChange={setDraftContent}
              draftSlug={draftSlug}
              onDraftSlugChange={setDraftSlug}
              onNext={handleNext}
              onBack={handleBack}
              canProceed={canProceed}
            />
          )}
          {step === 4 && (
            <OpponentStep
              caseSlug={caseSlug}
              draftContent={draftContent}
              selectedGruende={selectedGruende}
              findings={opponentFindings}
              onFindingsChange={setOpponentFindings}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {step === 5 && (
            <ExportStep
              caseSlug={caseSlug}
              analysis={analysis}
              selectedGruende={selectedGruende}
              draftContent={draftContent}
              draftSlug={draftSlug}
              opponentFindings={opponentFindings}
              onBack={handleBack}
              onReset={() => {
                setAnalysis(null);
                setBerufungsgruende([]);
                setDraftContent("");
                setDraftSlug("");
                setOpponentFindings([]);
                goToStep(1);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
