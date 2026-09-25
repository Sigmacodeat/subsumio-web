"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Search,
  Filter,
  Landmark,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Database,
  GitBranch,
  Scale,
  FileText,
  ArrowLeft,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { GroundedOutputPanel } from "@/components/legal/GroundedOutputPanel";
import { csrfFetch } from "@/lib/csrf";

interface SearchResult {
  id: string;
  title: string;
  court: string;
  court_level: string | null;
  decision_date: string | null;
  decision_type: string | null;
  legal_area: string | null;
  file_number: string | null;
  ecli: string | null;
  citation_count: number;
  treatment_status: string;
  snippet: string;
  bm25_score: number;
  vector_score: number;
  citation_boost: number;
  final_score: number;
  source: "bm25" | "vector" | "hybrid";
  rerank_score?: number;
  rerank_reason?: string;
}

interface PipelineStep {
  agent: string;
  status: "pending" | "running" | "done" | "error";
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  result?: unknown;
  error?: string;
}

interface PipelineResultData {
  query: string;
  steps: PipelineStep[];
  answer: string;
  citations: Array<{
    judgement_id: string;
    title: string;
    court: string;
    file_number: string | null;
    treatment: string;
    relevance: number;
  }>;
  retrieval_results: SearchResult[];
  routing: {
    intent: string;
    legal_concepts: string[];
    jurisdiction: string;
    search_strategy: string;
    expanded_query: string;
  };
  validation_summary?: {
    good_law: number;
    bad_law: number;
    at_risk: number;
    mixed: number;
    unknown: number;
  };
  total_duration_ms: number;
}

interface CitationNode {
  id: string;
  reference: string;
  treatment: string;
  court?: string;
  decision_date?: string;
  title?: string;
  context: string;
}

interface JudgementDetail {
  id: string;
  title: string;
  court: string;
  court_level: string | null;
  jurisdiction: string;
  decision_date: string | null;
  decision_type: string | null;
  legal_area: string | null;
  file_number: string | null;
  ecli: string | null;
  content: string;
  summary: string | null;
  citation_count: number;
  cited_by_count: number;
  treatment_status: string;
  treatment_summary: string | null;
  treatment_overall?: string;
  positive_count?: number;
  negative_count?: number;
  neutral_count?: number;
  total_citations?: number;
  time_weighted_score?: number;
  at_risk_reasons?: string[];
  citation_graph: {
    outgoing: CitationNode[];
    incoming: CitationNode[];
  };
}

const TREATMENT_ICONS: Record<string, typeof CheckCircle2> = {
  good_law: CheckCircle2,
  bad_law: XCircle,
  at_risk: AlertTriangle,
  mixed: HelpCircle,
  unknown: HelpCircle,
};

const TREATMENT_COLORS: Record<string, string> = {
  good_law: "text-[color:var(--ds-success-text)] bg-[color:var(--ds-success-bg)]",
  bad_law: "text-[color:var(--ds-danger-text)] bg-[color:var(--ds-danger-bg)]",
  at_risk: "text-[color:var(--ds-attention-text)] bg-[color:var(--ds-attention-bg)]",
  mixed: "text-[color:var(--ds-warning-text)] bg-[color:var(--ds-warning-bg)] ",
  unknown: "text-[color:var(--ds-neutral-text)] bg-[color:var(--ds-neutral-bg)]",
};

// Same vocabulary as the commentaries tab.
const TREATMENT_LABELS: Record<string, { de: string; en: string }> = {
  good_law: { de: "Gültig", en: "Good law" },
  bad_law: { de: "Überholt", en: "Bad law" },
  at_risk: { de: "Angreifbar", en: "At risk" },
  mixed: { de: "Gemischt", en: "Mixed" },
  unknown: { de: "Unbekannt", en: "Unknown" },
};

/** How a later decision treats the cited one. */
const CITE_TREATMENT_LABELS: Record<string, string> = {
  positive: "bestätigend",
  negative: "ablehnend",
  neutral: "neutral",
  distinguishing: "abgrenzend",
  overruled: "überholt",
  unknown: "unbekannt",
};

const SEARCH_UNAVAILABLE =
  "Die Suche ist gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut.";

export default function JudgementsDbPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [rerank, setRerank] = useState(false);
  const [pipelineMode, setPipelineMode] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResultData | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineGraphSearch, setPipelineGraphSearch] = useState(false);
  const [pipelineValidation, setPipelineValidation] = useState(true);
  const [filters, setFilters] = useState({
    jurisdiction: "at",
    court: "",
    courtLevel: "",
    legalArea: "",
    dateFrom: "",
    dateTo: "",
    treatmentStatus: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JudgementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    embedded: number;
    withCitations: number;
    byCourt: { court: string; count: number }[];
    byTreatment: { status: string; count: number }[];
  } | null>(null);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setPipelineResult(null);
    try {
      const params = new URLSearchParams({ q: query, ...filters, rerank: String(rerank) });
      const res = await fetch(`/api/legal/judgements-db?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch {
      setError(SEARCH_UNAVAILABLE);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, filters, rerank]);

  const runPipelineSearch = useCallback(async () => {
    if (!query.trim()) return;
    setPipelineLoading(true);
    setError(null);
    setPipelineResult(null);
    try {
      const res = await csrfFetch("/api/legal/judgements-db/pipeline", {
        method: "POST",
        // Long-running: csrfFetch would otherwise abort after 30s.
        signal: AbortSignal.timeout(300_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          rerank: "true",
          graphSearch: String(pipelineGraphSearch),
          validateCitations: String(pipelineValidation),
          maxResults: "20",
          jurisdiction: "at",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPipelineResult(data);
      setResults(data.retrieval_results || []);
      setTotal(data.retrieval_results?.length || 0);
    } catch {
      setError(SEARCH_UNAVAILABLE);
    } finally {
      setPipelineLoading(false);
    }
  }, [query, pipelineGraphSearch, pipelineValidation]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/legal/judgements-db?action=stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/legal/judgements-db/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data);
    } catch {
      setSelectedId(null);
      setError("Die Entscheidung konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Embedding/graph maintenance (formerly shown here) is operator work and
  // belongs in the operator console, not on the lawyer's research page.
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── Detail View ─────────────────────────────────────────────────

  if (selectedId && detail) {
    return (
      <DetailPanel
        detail={detail}
        onBack={() => {
          setSelectedId(null);
          setDetail(null);
        }}
        onValidate={async () => {
          await csrfFetch(`/api/legal/judgements-db/${encodeURIComponent(detail.id)}`, {
            method: "POST",
          });
          loadDetail(detail.id);
        }}
      />
    );
  }

  if (selectedId && detailLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-6 w-2/3 rounded" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  // ── Search View ─────────────────────────────────────────────────

  return (
    // Embedded in the research page, which owns the page header (one h1 per page).
    <div className="flex flex-col">
      <p className="mb-4 text-xs text-[color:var(--ds-text-muted)]">
        Entscheidungsdatenbank mit Zitationsnetz und Prüfung der Fortgeltung
      </p>

      {/* Stats Bar */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard
            icon={<Database className="h-4 w-4" />}
            label="Entscheidungen"
            value={stats.total.toLocaleString("de-AT")}
          />
          <StatCard
            icon={<GitBranch className="h-4 w-4" />}
            label="Mit Zitationen"
            value={stats.withCitations.toLocaleString("de-AT")}
          />
          <StatCard
            icon={<Scale className="h-4 w-4" />}
            label="Gerichte"
            value={stats.byCourt.length.toString()}
          />
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (pipelineMode ? runPipelineSearch() : search())}
            placeholder="Suche nach Schlagwort, Geschäftszahl, Thema …"
            aria-label="Entscheidungen durchsuchen"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-4 pl-10 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters(!showFilters)}
          aria-pressed={showFilters}
          className="gap-2 whitespace-nowrap"
        >
          <Filter className="h-4 w-4" />
          Filter
        </Button>
        <Button
          onClick={pipelineMode ? runPipelineSearch : search}
          disabled={(pipelineMode ? pipelineLoading : loading) || !query.trim()}
          className="gap-2 whitespace-nowrap"
        >
          {(pipelineMode ? pipelineLoading : loading) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Suchen
        </Button>
      </div>

      {/* Search options */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[color:var(--ds-text-muted)]">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={pipelineMode}
            onChange={(e) => setPipelineMode(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-[var(--brand-primary)]"
          />
          Mit KI-Zusammenfassung
        </label>
        {pipelineMode ? (
          <>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={pipelineGraphSearch}
                onChange={(e) => setPipelineGraphSearch(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[var(--brand-primary)]"
              />
              Zitationsnetz einbeziehen
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={pipelineValidation}
                onChange={(e) => setPipelineValidation(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[var(--brand-primary)]"
              />
              Fortgeltung prüfen
            </label>
          </>
        ) : (
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={rerank}
              onChange={(e) => setRerank(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-[var(--brand-primary)]"
            />
            Treffer mit KI nach Relevanz ordnen
          </label>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded border border-[color:var(--ds-border)] px-3 py-2 text-sm text-[color:var(--ds-text)]">
            Österreich
          </div>
          <input
            type="text"
            placeholder="Gericht"
            aria-label="Gericht"
            value={filters.court}
            onChange={(e) => setFilters({ ...filters, court: e.target.value })}
            className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
          />
          <select
            value={filters.courtLevel}
            onChange={(e) => setFilters({ ...filters, courtLevel: e.target.value })}
            aria-label="Instanz"
            className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
          >
            <option value="">Alle Instanzen</option>
            <option value="supreme">Höchstgericht</option>
            <option value="appeals">Rechtsmittelgericht</option>
            <option value="specialized">Fachgericht</option>
            <option value="district">Bezirksgericht</option>
          </select>
          <select
            value={filters.treatmentStatus}
            onChange={(e) => setFilters({ ...filters, treatmentStatus: e.target.value })}
            aria-label="Fortgeltung"
            className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
          >
            <option value="">Jede Fortgeltung</option>
            <option value="good_law">Gültig</option>
            <option value="bad_law">Überholt</option>
            <option value="at_risk">Angreifbar</option>
            <option value="mixed">Gemischt</option>
            <option value="unknown">Unbekannt</option>
          </select>
          <input
            type="date"
            placeholder="Von"
            aria-label="Entscheidungsdatum von"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
          />
          <input
            type="date"
            placeholder="Bis"
            aria-label="Entscheidungsdatum bis"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-sm text-[color:var(--ds-danger-text)]">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {/* Pipeline Results */}
        {pipelineResult && <PipelinePanel result={pipelineResult} />}

        {results.length > 0 && (
          <div className="mb-2 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
            {total} Treffer
          </div>
        )}

        {(loading || pipelineLoading) && results.length === 0 && (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        )}

        {results.length === 0 && !loading && !pipelineLoading && query && (
          <EmptyState
            icon={Search}
            title="Keine Treffer"
            description="Versuchen Sie eine andere Suchanfrage oder lockern Sie die Filter."
            actionLabel="Suche zurücksetzen"
            onAction={() => setQuery("")}
          />
        )}

        {results.length === 0 && !loading && !pipelineLoading && !query && (
          <div className="flex flex-col items-center justify-center py-12 text-[color:var(--ds-text-muted)]">
            <Landmark className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">
              Suchen Sie nach Entscheidungen, Geschäftszahlen oder Rechtsgebieten.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {results.map((result) => (
            <ResultCard key={result.id} result={result} onClick={() => loadDetail(result.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]">
        {icon}
      </div>
      <div>
        <p className="text-xs text-[color:var(--ds-text-muted)]">{label}</p>
        <p className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function ResultCard({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const TreatmentIcon = TREATMENT_ICONS[result.treatment_status] ?? HelpCircle;
  const treatmentColor = TREATMENT_COLORS[result.treatment_status] ?? TREATMENT_COLORS.unknown;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left transition-[background-color,border-color,color] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-surface-2)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-sm font-medium text-[color:var(--ds-text)]">{result.court}</span>
            {result.file_number && (
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                — {result.file_number}
              </span>
            )}
            {result.decision_date && (
              <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                · {formatDate(result.decision_date)}
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-sm font-medium text-[color:var(--ds-text)]">
            {result.title}
          </h3>
          {result.snippet && (
            <p className="mt-1 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
              {result.snippet}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className={cn("flex items-center gap-1 rounded px-2 py-0.5", treatmentColor)}>
              <TreatmentIcon className="h-3 w-3" />
              {TREATMENT_LABELS[result.treatment_status]?.de ?? result.treatment_status}
            </span>
            {result.citation_count > 0 && (
              <span className="flex items-center gap-1 text-[color:var(--ds-text-muted)]">
                <GitBranch className="h-3 w-3" />
                {result.citation_count} Zitate
              </span>
            )}
            {result.rerank_score !== undefined && (
              <span
                className="flex items-center gap-1 text-[color:var(--ds-text-muted)] tabular-nums"
                title={result.rerank_reason}
              >
                <Sparkles className="h-3 w-3" />
                Relevanz {result.rerank_score.toFixed(1).replace(".", ",")}/10
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--ds-text-muted)]" />
      </div>
    </button>
  );
}

function PipelinePanel({ result }: { result: PipelineResultData }) {
  // Run steps, routing and timings are technical telemetry — not shown to lawyers.
  return (
    <div className="mb-6 space-y-4">
      {/* Validation Summary */}
      {result.validation_summary && (
        <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h4 className="mb-2 text-xs font-medium text-[color:var(--ds-text-muted)]">
            Fortgeltung der gefundenen Entscheidungen
          </h4>
          <div className="flex flex-wrap gap-4 text-xs tabular-nums">
            <span className="flex items-center gap-1 text-[color:var(--ds-success-text)]">
              <CheckCircle2 className="h-3 w-3" />
              {result.validation_summary.good_law} gültig
            </span>
            <span className="flex items-center gap-1 text-[color:var(--ds-danger-text)]">
              <XCircle className="h-3 w-3" />
              {result.validation_summary.bad_law} überholt
            </span>
            <span className="flex items-center gap-1 text-[color:var(--ds-attention-text)]">
              <AlertTriangle className="h-3 w-3" />
              {result.validation_summary.at_risk} angreifbar
            </span>
            <span className="flex items-center gap-1 text-[color:var(--ds-neutral-text)]">
              <HelpCircle className="h-3 w-3" />
              {result.validation_summary.unknown} unbekannt
            </span>
          </div>
        </div>
      )}

      {/* Synthesized Answer */}
      {result.answer && (
        <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-[color:var(--ds-text-muted)]">
            <Sparkles className="h-3 w-3" />
            KI-Zusammenfassung
          </h4>
          <div className="prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
            {result.answer}
          </div>
          {/* Grounding invariant (CLAUDE.md): every AI answer carries the citation panel. */}
          <GroundedOutputPanel text={result.answer} className="mt-3" />
        </div>
      )}

      {/* Citations */}
      {result.citations.length > 0 && (
        <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h4 className="mb-2 text-xs font-medium text-[color:var(--ds-text-muted)]">
            Herangezogene Entscheidungen
          </h4>
          <div className="space-y-1">
            {result.citations.slice(0, 10).map((cite, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  [{i + 1}] {cite.court} — {cite.title}
                  {cite.file_number && ` (${cite.file_number})`}
                </span>
                <span className="ml-2 shrink-0 text-[color:var(--ds-text-muted)]">
                  {TREATMENT_LABELS[cite.treatment]?.de ?? cite.treatment}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  detail,
  onBack,
  onValidate,
}: {
  detail: JudgementDetail;
  onBack: () => void;
  onValidate: () => void;
}) {
  const TreatmentIcon = TREATMENT_ICONS[detail.treatment_status] ?? HelpCircle;
  const treatmentColor = TREATMENT_COLORS[detail.treatment_status] ?? TREATMENT_COLORS.unknown;
  const [validating, setValidating] = useState(false);

  return (
    <div className="flex flex-col">
      {/* Back */}
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Suche
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
          <Scale className="h-4 w-4" />
          {detail.court}
          {detail.file_number && <span>— {detail.file_number}</span>}
          {detail.decision_date && (
            <span className="tabular-nums">· {formatDate(detail.decision_date)}</span>
          )}
        </div>
        {/* h2: the research page owns the only h1. */}
        <h2 className="font-display mt-2 text-xl font-semibold text-[color:var(--ds-text)]">
          {detail.title}
        </h2>
        {detail.ecli && (
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">ECLI: {detail.ecli}</p>
        )}
      </div>

      {/* Treatment Status */}
      <div className={cn("mb-6 rounded-lg border p-4", treatmentColor)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TreatmentIcon className="h-5 w-5" />
            <span className="font-medium text-[color:var(--ds-text)]">
              {TREATMENT_LABELS[detail.treatment_status]?.de ?? detail.treatment_status}
            </span>
          </div>
          <button
            onClick={async () => {
              setValidating(true);
              await onValidate();
              setValidating(false);
            }}
            disabled={validating}
            className="flex items-center gap-1 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          >
            {validating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Fortgeltung prüfen
          </button>
        </div>
        {detail.treatment_summary && <p className="mt-2 text-sm">{detail.treatment_summary}</p>}
        {detail.at_risk_reasons && detail.at_risk_reasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {detail.at_risk_reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {reason}
              </li>
            ))}
          </ul>
        )}
        {detail.total_citations !== undefined && detail.total_citations > 0 && (
          <div className="mt-3 flex gap-4 text-xs">
            {detail.positive_count! > 0 && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> {detail.positive_count} positiv
              </span>
            )}
            {detail.negative_count! > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3" /> {detail.negative_count} negativ
              </span>
            )}
            {detail.neutral_count! > 0 && (
              <span className="flex items-center gap-1">
                <HelpCircle className="h-3 w-3" /> {detail.neutral_count} neutral
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {detail.content && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-[color:var(--ds-text)]">Volltext</h2>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm leading-relaxed text-[color:var(--ds-text)]">
            {detail.content.slice(0, 5000)}
            {detail.content.length > 5000 && (
              <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
                … (weitere {detail.content.length - 5000} Zeichen nicht angezeigt)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Citation Graph */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Outgoing */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
            <GitBranch className="h-4 w-4" />
            Zitiert ({detail.citation_graph.outgoing.length})
          </h2>
          <div className="space-y-2">
            {detail.citation_graph.outgoing.length === 0 ? (
              <p className="text-xs text-[color:var(--ds-text-muted)]">Keine Zitate extrahiert.</p>
            ) : (
              detail.citation_graph.outgoing
                .slice(0, 20)
                .map((cite, i) => <CitationItem key={i} cite={cite} direction="outgoing" />)
            )}
          </div>
        </div>

        {/* Incoming */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
            <FileText className="h-4 w-4" />
            Wird zitiert von ({detail.citation_graph.incoming.length})
          </h2>
          <div className="space-y-2">
            {detail.citation_graph.incoming.length === 0 ? (
              <p className="text-xs text-[color:var(--ds-text-muted)]">Keine eingehenden Zitate.</p>
            ) : (
              detail.citation_graph.incoming
                .slice(0, 20)
                .map((cite, i) => <CitationItem key={i} cite={cite} direction="incoming" />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CitationItem({ cite }: { cite: CitationNode; direction: "outgoing" | "incoming" }) {
  const treatmentColors: Record<string, string> = {
    positive: "text-[color:var(--ds-success-text)]",
    negative: "text-[color:var(--ds-danger-text)]",
    neutral: "text-[color:var(--ds-neutral-text)]",
    distinguishing: "text-[color:var(--ds-warning-text)]",
    overruled: "text-[color:var(--ds-danger-text)]",
    unknown: "text-[color:var(--ds-neutral-text)]",
  };

  return (
    <div className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-xs text-[color:var(--ds-text)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[color:var(--ds-text)]">{cite.reference}</span>
        <span
          className={cn("font-medium", treatmentColors[cite.treatment] ?? treatmentColors.unknown)}
        >
          {CITE_TREATMENT_LABELS[cite.treatment] ?? cite.treatment}
        </span>
      </div>
      {(cite.court || cite.decision_date) && (
        <p className="mt-1 text-[color:var(--ds-text-muted)]">
          {cite.court}
          {cite.decision_date && ` · ${formatDate(cite.decision_date)}`}
        </p>
      )}
      {cite.context && (
        <p className="mt-1 line-clamp-2 text-[color:var(--ds-text-muted)] italic">
          &ldquo;{cite.context.slice(0, 200)}&rdquo;
        </p>
      )}
    </div>
  );
}
