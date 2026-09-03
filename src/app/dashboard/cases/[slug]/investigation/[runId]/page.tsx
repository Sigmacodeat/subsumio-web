"use client";

import { useState, useMemo, useCallback, useEffect, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  AlertCircle,
  FileText,
  AlertTriangle,
  Scale,
  ChevronRight,
  Check,
  X,
  Circle,
  Clock,
  MapPin,
  User,
  Hash,
  GitCompare,
  HelpCircle,
  Lightbulb,
  ListTree,
  Gavel,
  ExternalLink,
  Filter,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { csrfFetch } from "@/lib/csrf";
import { useToast } from "@/components/ui/toast";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { cn } from "@/lib/utils";
import type {
  CaseInvestigationResult,
  CaseInvestigationContradiction,
  CaseInvestigationContradictionCategory,
  CaseInvestigationSeverity,
  MatterFactEntry,
} from "@/lib/matter-context-types";

// ── Helpers ────────────────────────────────────────────────────────────

const severityConfig: Record<
  CaseInvestigationSeverity,
  { label: string; variant: "danger" | "warning" | "default"; dot: string }
> = {
  hoch: { label: "HOCH", variant: "danger", dot: "bg-[color:var(--ds-danger-solid)]" },
  mittel: { label: "MITTEL", variant: "warning", dot: "bg-[color:var(--ds-warning-solid)]" },
  niedrig: { label: "NIEDRIG", variant: "default", dot: "bg-[color:var(--ds-text-muted)]" },
};

const categoryIcons: Record<CaseInvestigationContradictionCategory, React.ElementType> = {
  direkt: GitCompare,
  zeitlich: Clock,
  räumlich: MapPin,
  identität: User,
  mengen: Hash,
  kausal: ListTree,
  semantisch: Search,
  dokumentarisch: FileText,
  aussageentwicklung: AlertTriangle,
  rechtlich: Scale,
};

const categoryLabels: Record<CaseInvestigationContradictionCategory, string> = {
  direkt: "Direkt",
  zeitlich: "Zeitlich",
  räumlich: "Räumlich",
  identität: "Identität",
  mengen: "Mengen",
  kausal: "Kausal",
  semantisch: "Semantisch",
  dokumentarisch: "Dokumentarisch",
  aussageentwicklung: "Aussageentwicklung",
  rechtlich: "Rechtlich",
};

const reviewStatusConfig: Record<
  NonNullable<CaseInvestigationContradiction["review_status"]>,
  { label: string; icon: React.ElementType; color: string }
> = {
  pending: { label: "ungeprüft", icon: Circle, color: "text-[color:var(--ds-text-muted)]" },
  accepted: { label: "akzeptiert", icon: Check, color: "text-[color:var(--ds-success-solid)]" },
  dismissed: { label: "verworfen", icon: X, color: "text-[color:var(--ds-danger-solid)]" },
  no_contradiction: {
    label: "kein Widerspruch",
    icon: Circle,
    color: "text-[color:var(--ds-text-muted)]",
  },
};

type TabKey = "contradictions" | "chronology" | "gaps" | "questions" | "hypotheses";

const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "contradictions", label: "Widersprüche", icon: GitCompare },
  { key: "chronology", label: "Chronologie", icon: Clock },
  { key: "gaps", label: "Beweislücken", icon: AlertTriangle },
  { key: "questions", label: "Fragen", icon: HelpCircle },
  { key: "hypotheses", label: "Hypothesen", icon: Lightbulb },
];

// ── Page ───────────────────────────────────────────────────────────────

export default function InvestigationPage({
  params,
}: {
  params: Promise<{ slug: string; runId: string }>;
}) {
  const { slug, runId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const {
    grounding,
    isGrounding,
    groundingError,
    groundAnswer,
    reset: resetGrounding,
  } = useGroundedAnswer();

  const [result, setResult] = useState<CaseInvestigationResult | null>(null);
  const [factsMap, setFactsMap] = useState<Record<string, MatterFactEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("contradictions");
  const [selectedContradictionId, setSelectedContradictionId] = useState<string | null>(null);
  // URL-backed filters — shareable links, survives refresh
  const filterHighOnly = searchParams.get("high") === "1";
  const filterUnreviewedOnly = searchParams.get("unreviewed") === "1";
  const toggleFilter = useCallback(
    (key: "high" | "unreviewed") => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.get(key) === "1";
      if (current) params.delete(key);
      else params.set(key, "1");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState<Record<string, string>>({});
  const [showDismissInput, setShowDismissInput] = useState<string | null>(null);

  // ── Load investigation result ────────────────────────────────────────

  const loadResult = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/legal/case-investigation/${encodeURIComponent(runId)}`, {
        method: "GET",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      const data = (json.data ?? json) as CaseInvestigationResult;
      setResult(data);
      if (data.contradictions.length > 0) {
        setSelectedContradictionId(data.contradictions[0].id);
      }
      // Load MatterContextBundle to get exact_quote for each fact
      try {
        const factsRes = await csrfFetch(`/api/matter-context/${encodeURIComponent(slug)}`, {
          method: "GET",
        });
        if (factsRes.ok) {
          const bundle = await factsRes.json();
          const facts: MatterFactEntry[] = bundle.facts ?? [];
          const map: Record<string, MatterFactEntry> = {};
          for (const f of facts) {
            map[f.id] = f;
          }
          setFactsMap(map);
        }
      } catch {
        // Non-fatal — quotes will show placeholder
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [runId, slug]);

  // Load on mount
  useEffect(() => {
    loadResult();
  }, [loadResult]);

  // ── Filtered contradictions ──────────────────────────────────────────

  const filteredContradictions = useMemo(() => {
    if (!result) return [];
    return result.contradictions
      .filter((c) => !filterHighOnly || c.severity === "hoch")
      .filter((c) => !filterUnreviewedOnly || !c.review_status || c.review_status === "pending")
      .sort((a, b) => {
        const sevOrder = { hoch: 0, mittel: 1, niedrig: 2 };
        return sevOrder[a.severity] - sevOrder[b.severity];
      });
  }, [result, filterHighOnly, filterUnreviewedOnly]);

  const selectedContradiction = useMemo(
    () => result?.contradictions.find((c) => c.id === selectedContradictionId) ?? null,
    [result, selectedContradictionId]
  );

  // Ground AI output text when a contradiction is selected (Subsumio invariant)
  useEffect(() => {
    if (!selectedContradiction) {
      resetGrounding();
      return;
    }
    const textToGround = [
      selectedContradiction.belastende_interpretation,
      selectedContradiction.entlastende_interpretation,
      ...selectedContradiction.alternative_explanations,
    ].join("\n\n");
    if (textToGround.trim()) {
      groundAnswer(textToGround);
    }
  }, [selectedContradictionId, selectedContradiction, groundAnswer, resetGrounding]);

  // ── Review mutation (accept/dismiss) ─────────────────────────────────

  const submitReview = useCallback(
    async (
      contradictionId: string,
      reviewStatus: "accepted" | "dismissed" | "no_contradiction",
      reason?: string
    ) => {
      setReviewLoading(contradictionId);
      try {
        const res = await csrfFetch(
          `/api/legal/case-investigation/${encodeURIComponent(runId)}/contradictions/${encodeURIComponent(contradictionId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              review_status: reviewStatus,
              review_reason: reason,
            }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        const updated = (json.data ?? json) as CaseInvestigationContradiction;
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            contradictions: prev.contradictions.map((c) =>
              c.id === contradictionId ? updated : c
            ),
          };
        });
        addToast({
          title: "Prüfung gespeichert",
          description: `Widerspruch als „${reviewStatusConfig[reviewStatus].label}" markiert`,
          type: "success",
        });
        setShowDismissInput(null);
        setDismissReason((prev) => ({ ...prev, [contradictionId]: "" }));
      } catch (e) {
        addToast({
          title: "Fehler beim Speichern",
          description: e instanceof Error ? e.message : "Unbekannter Fehler",
          type: "error",
        });
      } finally {
        // Only clear loading if still ours — avoids race when user navigated
        // to another contradiction and started a new review in the meantime.
        setReviewLoading((prev) => (prev === contradictionId ? null : prev));
      }
    },
    [runId, addToast]
  );

  // ── Loading state ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title="Sachverhaltsprüfung"
          description="Widersprüche, Beweislücken und Fragen werden geladen…"
          breadcrumbs={[
            { label: "Kanzlei-Cockpit", href: "/dashboard" },
            { label: "Fälle", href: "/dashboard/cases" },
            { label: "Sachverhaltsprüfung" },
          ]}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="h-[600px] animate-pulse p-4 motion-reduce:animate-none">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-[color:var(--ds-surface-2)]" />
              ))}
            </div>
          </Card>
          <Card className="h-[600px] animate-pulse p-6 motion-reduce:animate-none">
            <div className="space-y-4">
              <div className="h-6 w-1/3 rounded bg-[color:var(--ds-surface-2)]" />
              <div className="h-32 rounded-lg bg-[color:var(--ds-surface-2)]" />
              <div className="h-32 rounded-lg bg-[color:var(--ds-surface-2)]" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="mx-auto max-w-[800px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title="Sachverhaltsprüfung"
          breadcrumbs={[
            { label: "Kanzlei-Cockpit", href: "/dashboard" },
            { label: "Fälle", href: "/dashboard/cases" },
            { label: "Sachverhaltsprüfung" },
          ]}
        />
        <Card className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-[color:var(--ds-danger-text)]" />
            <div className="space-y-3">
              <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
                Sachverhaltsprüfung konnte nicht geladen werden
              </p>
              <p className="text-xs text-[color:var(--ds-danger-text)]/80">{error}</p>
              <Button variant="secondary" size="sm" onClick={loadResult}>
                Erneut versuchen
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!result) return null;

  const caseSlugDecoded = decodeURIComponent(slug);
  const stats = {
    contradictions: result.contradictions.length,
    highSeverity: result.contradictions.filter((c) => c.severity === "hoch").length,
    gaps: result.evidence_gaps.length,
    questions: result.neutral_questions.length,
    hypotheses: result.alternative_hypotheses.length,
    reviewed: result.contradictions.filter((c) => c.review_status && c.review_status !== "pending")
      .length,
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Sachverhaltsprüfung"
        description={`Fall ${caseSlugDecoded} · ${result.claims_count} Behauptungen geprüft`}
        breadcrumbs={[
          { label: "Kanzlei-Cockpit", href: "/dashboard" },
          { label: "Fälle", href: "/dashboard/cases" },
          { label: caseSlugDecoded, href: `/dashboard/cases/${slug}` },
          { label: "Sachverhaltsprüfung" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/cases/${slug}`}>
              <Button variant="ghost" size="sm">
                Zurück zum Fall
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Stats Bar ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={GitCompare}
          label="Widersprüche"
          value={stats.contradictions}
          accent="danger"
        />
        <StatCard
          icon={AlertTriangle}
          label="Hohe Relevanz"
          value={stats.highSeverity}
          accent="attention"
        />
        <StatCard icon={AlertTriangle} label="Beweislücken" value={stats.gaps} accent="warning" />
        <StatCard icon={HelpCircle} label="Fragen" value={stats.questions} accent="info" />
        <StatCard icon={Lightbulb} label="Hypothesen" value={stats.hypotheses} accent="default" />
        <StatCard
          icon={Check}
          label="Geprüft"
          value={stats.reviewed}
          total={stats.contradictions}
          accent="success"
        />
      </div>

      {/* ── Legal Framework Notice ────────────────────────────────── */}
      <Card className="border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4">
        <div className="flex items-start gap-3">
          <Scale className="h-5 w-5 shrink-0 text-[color:var(--ds-info-text)]" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-[color:var(--ds-info-text)]">
              Rechtlicher Rahmen:{" "}
              {result.rechtlicher_rahmen.zpo_vorschriften.length > 0
                ? result.rechtlicher_rahmen.zpo_vorschriften.join(", ")
                : "§§ 226 ff. ZPO"}
            </p>
            <p className="text-xs text-[color:var(--ds-info-text)]/80">
              {result.rechtlicher_rahmen.verfahrensschritt} · Die KI erfindet keine Tatsachen. Sie
              identifiziert Tatsachenbehauptungen der Parteien und gegenüberstellend
              widersprüchliche Behauptungen (§ 226 ZPO). Jede Aussage ist durch eine Quelle belegt.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Tab Bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1">
        {tabs.map((tab) => {
          const count =
            tab.key === "contradictions"
              ? stats.contradictions
              : tab.key === "gaps"
                ? stats.gaps
                : tab.key === "questions"
                  ? stats.questions
                  : tab.key === "hypotheses"
                    ? stats.hypotheses
                    : 0;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                isActive
                  ? "bg-[color:var(--brand-primary)] text-white shadow-sm"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)]"
              )}
              aria-pressed={isActive}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────── */}
      {activeTab === "contradictions" && (
        <ContradictionsTab
          contradictions={filteredContradictions}
          selected={selectedContradiction}
          onSelect={setSelectedContradictionId}
          filterHighOnly={filterHighOnly}
          filterUnreviewedOnly={filterUnreviewedOnly}
          onToggleHighOnly={() => toggleFilter("high")}
          onToggleUnreviewedOnly={() => toggleFilter("unreviewed")}
          onSubmitReview={submitReview}
          reviewLoading={reviewLoading}
          dismissReason={dismissReason}
          setDismissReason={(id, val) => setDismissReason((prev) => ({ ...prev, [id]: val }))}
          showDismissInput={showDismissInput}
          setShowDismissInput={setShowDismissInput}
          pruefbedarfHinweis={result.pruefbedarf_hinweis}
          factsMap={factsMap}
        />
      )}

      {activeTab === "chronology" && <ChronologyTab result={result} />}

      {activeTab === "gaps" && <GapsTab result={result} />}

      {activeTab === "questions" && <QuestionsTab result={result} />}

      {activeTab === "hypotheses" && <HypothesesTab result={result} />}

      {/* ── Citation Panel + Attorney Review ──────────────────────── */}
      {activeTab === "contradictions" && selectedContradiction && (
        <>
          <CitationPanel
            data={
              {
                citations: [
                  {
                    slug: selectedContradiction.claim_a_id,
                    title: `Aussage A — ${selectedContradiction.claim_a_id}`,
                  },
                  {
                    slug: selectedContradiction.claim_b_id,
                    title: `Aussage B — ${selectedContradiction.claim_b_id}`,
                  },
                ],
                grounding,
                isStreaming: isGrounding,
                attorneyReviewRequired: true,
                jurisdiction: result.jurisdiction.toUpperCase(),
              } satisfies CitationPanelData
            }
          />
          {groundingError && (
            <Card
              className="border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3"
              role="alert"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-[color:var(--ds-warning-text)]" />
                <p className="text-xs text-[color:var(--ds-warning-text)]">
                  Corpus-Grounding konnte nicht durchgeführt werden: {groundingError}. Zitate wurden
                  nicht gegen den Corpus verifiziert — bitte manuell prüfen.
                </p>
              </div>
            </Card>
          )}
          <Card className="border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] p-4">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 shrink-0 text-[color:var(--ds-attention-text)]" />
              <p className="text-sm font-medium text-[color:var(--ds-attention-text)]">
                anwaltlich zu prüfen — diese Analyse ersetzt keine anwaltliche Sachverhaltsprüfung.
                Jede Aussage ist durch eine Quelle belegt und muss am Original verifiziert werden.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  total?: number;
  accent: "danger" | "attention" | "warning" | "info" | "success" | "default";
}) {
  const colorMap = {
    danger: "text-[color:var(--ds-danger-text)]",
    attention: "text-[color:var(--ds-attention-text)]",
    warning: "text-[color:var(--ds-warning-text)]",
    info: "text-[color:var(--ds-info-text)]",
    success: "text-[color:var(--ds-success-text)]",
    default: "text-[color:var(--ds-text)]",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", colorMap[accent])} />
        <span className="text-xs text-[color:var(--ds-text-muted)]">{label}</span>
      </div>
      <p className="font-display mt-2 text-2xl font-semibold text-[color:var(--ds-text)]">
        {value}
        {total !== undefined && (
          <span className="ml-1 text-sm font-normal text-[color:var(--ds-text-muted)]">
            / {total}
          </span>
        )}
      </p>
    </Card>
  );
}

// ── Contradictions Tab (Split-Pane) ────────────────────────────────────

function ContradictionsTab({
  contradictions,
  selected,
  onSelect,
  filterHighOnly,
  filterUnreviewedOnly,
  onToggleHighOnly,
  onToggleUnreviewedOnly,
  onSubmitReview,
  reviewLoading,
  dismissReason,
  setDismissReason,
  showDismissInput,
  setShowDismissInput,
  pruefbedarfHinweis,
  factsMap,
}: {
  contradictions: CaseInvestigationContradiction[];
  selected: CaseInvestigationContradiction | null;
  onSelect: (id: string) => void;
  filterHighOnly: boolean;
  filterUnreviewedOnly: boolean;
  onToggleHighOnly: () => void;
  onToggleUnreviewedOnly: () => void;
  onSubmitReview: (
    id: string,
    status: "accepted" | "dismissed" | "no_contradiction",
    reason?: string
  ) => void;
  reviewLoading: string | null;
  dismissReason: Record<string, string>;
  setDismissReason: (id: string, val: string) => void;
  showDismissInput: string | null;
  setShowDismissInput: (id: string | null) => void;
  pruefbedarfHinweis: string;
  factsMap: Record<string, MatterFactEntry>;
}) {
  if (contradictions.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Check className="mx-auto h-12 w-12 text-[color:var(--ds-success-solid)]" />
        <p className="mt-4 text-sm font-medium text-[color:var(--ds-text)]">
          Keine Widersprüche gefunden
        </p>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          Die extrahierten Sachverhaltsbehauptungen enthalten keine erkennbaren Widersprüche — oder
          alle wurden bereits geprüft.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      {/* ── Left: Contradiction List ─────────────────────────────── */}
      <div className="space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2">
          <Filter className="h-3.5 w-3.5 text-[color:var(--ds-text-muted)]" />
          <FilterChip active={filterHighOnly} onClick={onToggleHighOnly}>
            Nur hohe Relevanz
          </FilterChip>
          <FilterChip active={filterUnreviewedOnly} onClick={onToggleUnreviewedOnly}>
            Nur ungeprüfte
          </FilterChip>
        </div>

        {/* List */}
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 420px)" }}>
          {contradictions.map((c) => {
            const CatIcon = categoryIcons[c.category] ?? GitCompare;
            const sev = severityConfig[c.severity];
            const reviewStatus = c.review_status ?? "pending";
            const reviewCfg = reviewStatusConfig[reviewStatus];
            const ReviewIcon = reviewCfg.icon;
            const isSelected = selected?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ds-surface)] active:scale-[0.99]",
                  isSelected
                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/[0.06] shadow-sm"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-surface-2)]"
                )}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", sev.dot)} />
                    <CatIcon className="h-3.5 w-3.5 text-[color:var(--ds-text-muted)]" />
                    <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                      {categoryLabels[c.category]}
                    </span>
                  </div>
                  <ReviewIcon className={cn("h-3.5 w-3.5 shrink-0", reviewCfg.color)} />
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-[color:var(--ds-text)]">
                  {c.belastende_interpretation}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Badge variant={sev.variant} className="text-[10px]">
                    {sev.label}
                  </Badge>
                  {c.materiality === "zentral" && (
                    <Badge variant="attention" className="text-[10px]">
                      zentral
                    </Badge>
                  )}
                  {c.audit_verified && (
                    <Badge variant="success" className="text-[10px]">
                      <Check className="h-2.5 w-2.5" /> verifiziert
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: Detail ────────────────────────────────────────── */}
      {selected ? (
        <Card className="overflow-hidden">
          <div className="border-b border-[color:var(--ds-border)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {(() => {
                    const CatIcon = categoryIcons[selected.category] ?? GitCompare;
                    return <CatIcon className="h-4 w-4 text-[color:var(--ds-text-muted)]" />;
                  })()}
                  <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {categoryLabels[selected.category]} · {severityConfig[selected.severity].label}
                  </span>
                  {selected.materiality === "zentral" && (
                    <Badge variant="attention" className="text-[10px]">
                      zentral für Prüfauftrag
                    </Badge>
                  )}
                </div>
                <h2 className="font-display text-lg font-semibold text-[color:var(--ds-text)]">
                  Widerspruch {selected.id}
                </h2>
              </div>
              {selected.zpo_relevanz && (
                <Badge variant="info" className="shrink-0">
                  <Scale className="h-3 w-3" /> {selected.zpo_relevanz}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-6 p-5">
            {/* Side-by-side Quotes */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <QuoteBlock
                label="Aussage A"
                claimId={selected.claim_a_id}
                fact={factsMap[selected.claim_a_id]}
              />
              <QuoteBlock
                label="Aussage B"
                claimId={selected.claim_b_id}
                fact={factsMap[selected.claim_b_id]}
              />
            </div>

            {/* Contradiction indicator */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-full border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-1.5">
                <AlertCircle className="h-4 w-4 text-[color:var(--ds-danger-text)]" />
                <span className="text-xs font-semibold text-[color:var(--ds-danger-text)]">
                  widerspricht
                </span>
              </div>
            </div>

            {/* Alternative Explanations */}
            {selected.alternative_explanations.length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  <Lightbulb className="h-4 w-4 text-[color:var(--ds-warning-text)]" />
                  Alternative Erklärungen
                </h3>
                <ul className="space-y-1.5">
                  {selected.alternative_explanations.map((exp, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm text-[color:var(--ds-text-muted)]"
                    >
                      <span className="mt-0.5 text-[color:var(--ds-text-muted)]">•</span>
                      {exp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interpretations */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]/50 p-3">
                <p className="mb-1 text-xs font-semibold text-[color:var(--ds-danger-text)]">
                  Belastende Interpretation
                </p>
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {selected.belastende_interpretation}
                </p>
              </div>
              <div className="rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]/50 p-3">
                <p className="mb-1 text-xs font-semibold text-[color:var(--ds-success-text)]">
                  Entlastende Interpretation
                </p>
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {selected.entlastende_interpretation}
                </p>
              </div>
            </div>

            {/* Resolution Questions (PEACE) */}
            {selected.resolution_questions.length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  <HelpCircle className="h-4 w-4 text-[color:var(--ds-info-text)]" />
                  Neutrale Klärungsfragen (PEACE)
                </h3>
                <ol className="space-y-1.5">
                  {selected.resolution_questions.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm text-[color:var(--ds-text-muted)]"
                    >
                      <span className="mt-0.5 font-semibold text-[color:var(--ds-info-text)]">
                        {i + 1}.
                      </span>
                      {q}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Audit Status */}
            {selected.audit_verified && selected.audit_confidence !== undefined && (
              <div className="flex items-center gap-2 rounded-lg bg-[color:var(--ds-success-bg)] p-3">
                <Check className="h-4 w-4 text-[color:var(--ds-success-text)]" />
                <span className="text-xs text-[color:var(--ds-success-text)]">
                  Auditor-Verifikation: Zitate geprüft (Konfidenz{" "}
                  {Math.round(selected.audit_confidence * 100)} %)
                </span>
              </div>
            )}

            {/* Review Actions */}
            <div className="space-y-3 border-t border-[color:var(--ds-border)] pt-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                Anwaltliche Prüfung
              </h3>

              {showDismissInput === selected.id ? (
                <div className="space-y-2">
                  <textarea
                    value={dismissReason[selected.id] ?? ""}
                    onChange={(e) => setDismissReason(selected.id, e.target.value)}
                    placeholder="Grund für Verwerfung (z.B. harmlose Abweichung, geklärt durch Telefonat…)"
                    className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm focus:border-[color:var(--ds-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)]"
                    rows={2}
                    disabled={reviewLoading === selected.id}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={reviewLoading === selected.id}
                      onClick={() =>
                        onSubmitReview(selected.id, "dismissed", dismissReason[selected.id])
                      }
                    >
                      <X className="h-3.5 w-3.5" /> Verwerfen
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDismissInput(null)}
                      disabled={reviewLoading === selected.id}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    loading={reviewLoading === selected.id}
                    onClick={() => onSubmitReview(selected.id, "accepted")}
                  >
                    <Check className="h-3.5 w-3.5" /> Als Widerspruch akzeptieren
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={reviewLoading === selected.id}
                    onClick={() => setShowDismissInput(selected.id)}
                  >
                    <X className="h-3.5 w-3.5" /> Verwerfen
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={reviewLoading === selected.id}
                    onClick={() => onSubmitReview(selected.id, "no_contradiction")}
                  >
                    <Circle className="h-3.5 w-3.5" /> Kein Widerspruch — harmlose Abweichung
                  </Button>
                </div>
              )}

              {selected.review_status && selected.review_status !== "pending" && (
                <div
                  className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]"
                  role="status"
                  aria-live="polite"
                >
                  {(() => {
                    const ReviewIcon = reviewStatusConfig[selected.review_status!].icon;
                    return (
                      <ReviewIcon
                        className={cn(
                          "h-3.5 w-3.5",
                          reviewStatusConfig[selected.review_status!].color
                        )}
                      />
                    );
                  })()}
                  <span>
                    Geprüft: {reviewStatusConfig[selected.review_status!].label}
                    {selected.review_reason && ` — ${selected.review_reason}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pruefbedarf */}
          {pruefbedarfHinweis && (
            <div className="border-t border-[color:var(--ds-border)] bg-[color:var(--ds-attention-bg)] p-3">
              <p className="text-xs text-[color:var(--ds-attention-text)]">{pruefbedarfHinweis}</p>
            </div>
          )}
        </Card>
      ) : (
        <Card className="flex items-center justify-center p-12 text-center">
          <div className="space-y-2">
            <ChevronRight className="mx-auto h-8 w-8 text-[color:var(--ds-text-muted)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              Wählen Sie einen Widerspruch aus der Liste, um die Details zu sehen.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Quote Block ────────────────────────────────────────────────────────

function QuoteBlock({
  label,
  claimId,
  fact,
}: {
  label: string;
  claimId: string;
  fact?: MatterFactEntry;
}) {
  const quote = fact?.exact_quote ?? fact?.statement;
  const speaker = fact?.speaker_entity;
  const sourceSpan = fact?.source_span;
  return (
    <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
          {label}
          {speaker && (
            <span className="ml-1.5 text-[color:var(--ds-text-muted)]/70">— {speaker}</span>
          )}
        </span>
        <Badge variant="document" className="text-[10px]">
          {claimId}
        </Badge>
      </div>
      <blockquote className="border-l-2 border-[color:var(--brand-primary)]/40 pl-3 text-sm leading-relaxed text-[color:var(--ds-text)] italic">
        {quote
          ? `&bdquo;${quote}&ldquo;`
          : "&bdquo;Zitat nicht verfügbar — FactEntry nicht im Bundle gefunden&ldquo;"}
      </blockquote>
      {sourceSpan && (
        <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
          Quelle: {fact?.source ?? "—"} {sourceSpan}
        </p>
      )}
      <Link
        href={`/dashboard/brain/${encodeURIComponent(fact?.source ?? claimId)}`}
        className="mt-3 inline-flex items-center gap-1 text-xs text-[color:var(--brand-primary)] transition-colors hover:text-[color:var(--brand-primary-hover)]"
      >
        <ExternalLink className="h-3 w-3" />
        Im Dokument anzeigen
      </Link>
    </div>
  );
}

// ── Filter Chip ────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200 active:scale-[0.97]",
        active
          ? "bg-[color:var(--brand-primary)] text-white"
          : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

// ── Chronology Tab ─────────────────────────────────────────────────────

function ChronologyTab({ result }: { result: CaseInvestigationResult }) {
  // Chronology derived from contradictions with temporal category
  const temporalEntries = result.contradictions
    .filter((c) => c.category === "zeitlich")
    .sort((a, b) => a.id.localeCompare(b.id));

  if (temporalEntries.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Clock className="mx-auto h-10 w-10 text-[color:var(--ds-text-muted)]" />
        <p className="mt-3 text-sm text-[color:var(--ds-text-muted)]">
          Keine zeitlichen Widersprüche in dieser Analyse.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="font-display mb-4 text-base font-semibold text-[color:var(--ds-text)]">
        Zeitliche Widersprüche — Chronologie
      </h2>
      <div className="space-y-3">
        {temporalEntries.map((c) => (
          <div
            key={c.id}
            className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
          >
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ds-warning-text)]" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                {c.belastende_interpretation}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Aussage A: {c.claim_a_id} ↔ Aussage B: {c.claim_b_id}
              </p>
              {c.resolution_questions.length > 0 && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  → {c.resolution_questions[0]}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Gaps Tab ───────────────────────────────────────────────────────────

function GapsTab({ result }: { result: CaseInvestigationResult }) {
  if (result.evidence_gaps.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Check className="mx-auto h-10 w-10 text-[color:var(--ds-success-solid)]" />
        <p className="mt-3 text-sm text-[color:var(--ds-text-muted)]">
          Keine Beweislücken erkannt.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {result.evidence_gaps.map((gap) => (
        <Card key={gap.id} className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ds-warning-text)]" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-[color:var(--ds-text)]">{gap.beschreibung}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                    Fehlendes Beweismittel
                  </p>
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    {gap.fehlendes_beweismittel}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                    Erwartete Quelle
                  </p>
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    {gap.erwartete_quelle}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-2">
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  <strong>Beweisbedeutung:</strong> {gap.beweisbedeutung}
                </p>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Questions Tab ──────────────────────────────────────────────────────

function QuestionsTab({ result }: { result: CaseInvestigationResult }) {
  if (result.neutral_questions.length === 0) {
    return (
      <Card className="p-12 text-center">
        <HelpCircle className="mx-auto h-10 w-10 text-[color:var(--ds-text-muted)]" />
        <p className="mt-3 text-sm text-[color:var(--ds-text-muted)]">
          Keine Klärungsfragen generiert.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {result.neutral_questions.map((q) => (
        <Card key={q.id} className="p-5">
          <div className="flex items-start gap-3">
            <User className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ds-info-text)]" />
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                  An {q.ziel_person}
                </p>
                <p className="mt-1 text-sm font-medium text-[color:var(--ds-text)]">
                  {q.einstiegsfrage}
                </p>
              </div>
              {q.praezisierungsfragen.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                    Präzisierungsfragen:
                  </p>
                  <ol className="space-y-1">
                    {q.praezisierungsfragen.map((pf, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
                      >
                        <span className="font-semibold text-[color:var(--ds-info-text)]">
                          {i + 1}.
                        </span>
                        {pf}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {q.konfrontationsfrage && (
                <div className="rounded-lg border border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] p-3">
                  <p className="text-xs font-semibold text-[color:var(--ds-attention-text)]">
                    Konfrontationsfrage:
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--ds-attention-text)]">
                    {q.konfrontationsfrage}
                  </p>
                </div>
              )}
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                <strong>Beweisbedeutung:</strong> {q.beweisbedeutung}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Hypotheses Tab ─────────────────────────────────────────────────────

function HypothesesTab({ result }: { result: CaseInvestigationResult }) {
  if (result.alternative_hypotheses.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Lightbulb className="mx-auto h-10 w-10 text-[color:var(--ds-text-muted)]" />
        <p className="mt-3 text-sm text-[color:var(--ds-text-muted)]">
          Keine alternativen Hypothesen generiert.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {result.alternative_hypotheses.map((h) => (
        <Card key={h.id} className="p-5">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ds-warning-text)]" />
            <div className="space-y-3">
              <p className="text-sm font-medium text-[color:var(--ds-text)]">{h.beschreibung}</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]/50 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-[color:var(--ds-success-text)]">
                    Stützende Indizien
                  </p>
                  <ul className="space-y-1">
                    {h.stuetzende_indizien.map((ind, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1.5 text-xs text-[color:var(--ds-text-muted)]"
                      >
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--ds-success-solid)]" />
                        {ind}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]/50 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-[color:var(--ds-danger-text)]">
                    Gegen-Indizien
                  </p>
                  <ul className="space-y-1">
                    {h.gegen_indizien.map((ind, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1.5 text-xs text-[color:var(--ds-text-muted)]"
                      >
                        <X className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--ds-danger-solid)]" />
                        {ind}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
