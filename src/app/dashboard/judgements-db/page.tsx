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
  TrendingUp,
  Calendar,
  Scale,
  FileText,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  Brain,
  Zap,
  CheckCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

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

interface EmbeddingStatus {
  available: boolean;
  model?: string;
  dimensions?: number;
  error?: string;
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
  good_law: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
  bad_law: "text-red-600 bg-red-50 dark:bg-red-950/30",
  at_risk: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
  mixed: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30",
  unknown: "text-gray-500 bg-gray-50 dark:bg-gray-950/30",
};

const TREATMENT_LABELS: Record<string, { de: string; en: string }> = {
  good_law: { de: "Good Law", en: "Good Law" },
  bad_law: { de: "Bad Law", en: "Bad Law" },
  at_risk: { de: "At Risk", en: "At Risk" },
  mixed: { de: "Gemischt", en: "Mixed" },
  unknown: { de: "Unbekannt", en: "Unknown" },
};

export default function JudgementsDbPage() {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<"hybrid" | "bm25_only">("bm25_only");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [rerank, setRerank] = useState(false);
  const [pipelineMode, setPipelineMode] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResultData | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [graphEmbeddingStatus, setGraphEmbeddingStatus] = useState<{
    total_embeddings: number;
    avg_neighbours: number | null;
    last_computed: string | null;
  } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [pipelineGraphSearch, setPipelineGraphSearch] = useState(false);
  const [pipelineValidation, setPipelineValidation] = useState(true);
  const [reranked, setReranked] = useState(false);
  const [rerankModel, setRerankModel] = useState("");
  const [filters, setFilters] = useState({
    jurisdiction: "de",
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
    setReranked(false);
    setRerankModel("");
    try {
      const params = new URLSearchParams({ q: query, ...filters, rerank: String(rerank) });
      const res = await fetch(`/api/legal/judgements-db?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
      setMode(data.mode || "bm25_only");
      setReranked(data.reranked || false);
      setRerankModel(data.rerank_model || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
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
      const res = await fetch("/api/legal/judgements-db/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          rerank: "true",
          graphSearch: String(pipelineGraphSearch),
          validateCitations: String(pipelineValidation),
          maxResults: "20",
          jurisdiction: filters.jurisdiction || "de",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPipelineResult(data);
      setResults(data.retrieval_results || []);
      setTotal(data.retrieval_results?.length || 0);
      setMode("hybrid");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setPipelineLoading(false);
    }
  }, [query, filters, pipelineGraphSearch, pipelineValidation]);

  const loadEmbeddingStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/legal/judgements-db/import?action=embed_status");
      if (res.ok) {
        const data = await res.json();
        setEmbeddingStatus(data);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const loadGraphEmbeddingStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/legal/judgements-db/graph-embeddings?action=status");
      if (res.ok) {
        const data = await res.json();
        setGraphEmbeddingStatus(data);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const triggerGraphEmbedding = useCallback(async () => {
    setGraphLoading(true);
    try {
      const res = await fetch("/api/legal/judgements-db/graph-embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compute", hops: "2", sampleSize: "10", batchSize: "100" }),
      });
      if (res.ok) {
        await loadGraphEmbeddingStatus();
      }
    } catch {
      // Non-critical
    } finally {
      setGraphLoading(false);
    }
  }, [loadGraphEmbeddingStatus]);

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

  const triggerEmbedding = useCallback(async () => {
    setEmbedLoading(true);
    try {
      const res = await fetch("/api/legal/judgements-db/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "embed", batchSize: "50", maxItems: "500" }),
      });
      if (res.ok) {
        await loadEmbeddingStatus();
        await loadStats();
      }
    } catch {
      // Non-critical
    } finally {
      setEmbedLoading(false);
    }
  }, [loadEmbeddingStatus, loadStats]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/legal/judgements-db/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadEmbeddingStatus();
    loadGraphEmbeddingStatus();
  }, [loadStats, loadEmbeddingStatus, loadGraphEmbeddingStatus]);

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
          await fetch(`/api/legal/judgements-db/${encodeURIComponent(detail.id)}`, {
            method: "POST",
          });
          loadDetail(detail.id);
        }}
      />
    );
  }

  if (selectedId && detailLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  // ── Search View ─────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Database className="text-primary h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">Urteils-Datenbank</h1>
          <p className="text-muted-foreground text-sm">
            Semantische Suche · Citation Graph · Treatment Validation
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={<Database className="h-4 w-4" />}
            label="Urteile"
            value={stats.total.toLocaleString("de-DE")}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Embeddings"
            value={stats.embedded.toLocaleString("de-DE")}
          />
          <StatCard
            icon={<GitBranch className="h-4 w-4" />}
            label="Mit Zitationen"
            value={stats.withCitations.toLocaleString("de-DE")}
          />
          <StatCard
            icon={<Scale className="h-4 w-4" />}
            label="Gerichte"
            value={stats.byCourt.length.toString()}
          />
        </div>
      )}

      {/* Embedding Status */}
      {embeddingStatus && (
        <div className="bg-muted/30 mb-4 flex items-center justify-between rounded-lg border px-4 py-2">
          <div className="flex items-center gap-2 text-xs">
            {embeddingStatus.available ? (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-muted-foreground">
                  Embedding:{" "}
                  <span className="text-foreground font-medium">{embeddingStatus.model}</span> ·{" "}
                  {embeddingStatus.dimensions}d
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-muted-foreground">
                  Embedding nicht verfügbar: {embeddingStatus.error}
                </span>
              </>
            )}
          </div>
          {embeddingStatus.available && (
            <button
              onClick={triggerEmbedding}
              disabled={embedLoading}
              className="hover:bg-background flex items-center gap-1 rounded border px-2 py-1 text-xs"
            >
              {embedLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Embeddings generieren
            </button>
          )}
        </div>
      )}

      {/* Graph Embedding Status */}
      {graphEmbeddingStatus && (
        <div className="bg-muted/30 mb-4 flex items-center justify-between rounded-lg border px-4 py-2">
          <div className="flex items-center gap-2 text-xs">
            <GitBranch className="h-4 w-4 text-blue-500" />
            <span className="text-muted-foreground">
              GraphSAGE:{" "}
              <span className="text-foreground font-medium">
                {graphEmbeddingStatus.total_embeddings.toLocaleString("de-DE")}
              </span>{" "}
              Embeddings
              {graphEmbeddingStatus.avg_neighbours !== null && (
                <> · Ø {graphEmbeddingStatus.avg_neighbours.toFixed(1)} Nachbarn</>
              )}
              {graphEmbeddingStatus.last_computed && (
                <>
                  {" "}
                  · zuletzt{" "}
                  {new Date(graphEmbeddingStatus.last_computed).toLocaleDateString("de-DE")}
                </>
              )}
            </span>
          </div>
          <button
            onClick={triggerGraphEmbedding}
            disabled={graphLoading}
            className="hover:bg-background flex items-center gap-1 rounded border px-2 py-1 text-xs"
          >
            {graphLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <GitBranch className="h-3 w-3" />
            )}
            Graph berechnen
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (pipelineMode ? runPipelineSearch() : search())}
            placeholder="Suche nach Schlagwort, Aktenzeichen, Thema..."
            className="bg-background focus:ring-primary w-full rounded-lg border py-2.5 pr-4 pl-10 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
            showFilters ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          <Filter className="h-4 w-4" />
          Filter
        </button>
        {/* Pipeline Mode Toggle */}
        <button
          onClick={() => setPipelineMode(!pipelineMode)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
            pipelineMode ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
          title="Multi-Agent Pipeline: Query-Routing → Retrieval → Validation → Synthesis"
        >
          <Brain className="h-4 w-4" />
          Pipeline
        </button>
        {/* Reranking Toggle */}
        <button
          onClick={() => setRerank(!rerank)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
            rerank ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
          title="Cross-Encoder Reranking der Top-K Ergebnisse"
        >
          <Sparkles className="h-4 w-4" />
          Rerank
        </button>
        <button
          onClick={pipelineMode ? runPipelineSearch : search}
          disabled={(pipelineMode ? pipelineLoading : loading) || !query.trim()}
          className="bg-primary text-primary-foreground flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {(pipelineMode ? pipelineLoading : loading) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : pipelineMode ? (
            <Brain className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {pipelineMode ? "Pipeline" : "Suchen"}
        </button>
      </div>

      {/* Pipeline Options */}
      {pipelineMode && (
        <div className="bg-muted/30 mb-4 flex items-center gap-4 rounded-lg border px-4 py-2">
          <span className="text-muted-foreground text-xs font-medium">Pipeline-Optionen:</span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={pipelineGraphSearch}
              onChange={(e) => setPipelineGraphSearch(e.target.checked)}
              className="h-3.5 w-3.5 rounded"
            />
            <GitBranch className="h-3 w-3" />
            Graph Search
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={pipelineValidation}
              onChange={(e) => setPipelineValidation(e.target.checked)}
              className="h-3.5 w-3.5 rounded"
            />
            <CheckCircle2 className="h-3 w-3" />
            Citation Validation
          </label>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-muted/30 mb-4 grid grid-cols-2 gap-3 rounded-lg border p-4 md:grid-cols-4">
          <select
            value={filters.jurisdiction}
            onChange={(e) => setFilters({ ...filters, jurisdiction: e.target.value })}
            className="bg-background rounded border px-3 py-2 text-sm"
          >
            <option value="de">Deutschland</option>
            <option value="at">Österreich</option>
            <option value="ch">Schweiz</option>
            <option value="">Alle</option>
          </select>
          <input
            type="text"
            placeholder="Gericht"
            value={filters.court}
            onChange={(e) => setFilters({ ...filters, court: e.target.value })}
            className="bg-background rounded border px-3 py-2 text-sm"
          />
          <select
            value={filters.courtLevel}
            onChange={(e) => setFilters({ ...filters, courtLevel: e.target.value })}
            className="bg-background rounded border px-3 py-2 text-sm"
          >
            <option value="">Alle Instanzen</option>
            <option value="supreme">Obergericht</option>
            <option value="appeals">Berufungsgericht</option>
            <option value="specialized">Fachgericht</option>
            <option value="district">Amtsgericht</option>
          </select>
          <select
            value={filters.treatmentStatus}
            onChange={(e) => setFilters({ ...filters, treatmentStatus: e.target.value })}
            className="bg-background rounded border px-3 py-2 text-sm"
          >
            <option value="">Alle Behandlungen</option>
            <option value="good_law">Good Law</option>
            <option value="bad_law">Bad Law</option>
            <option value="at_risk">At Risk</option>
            <option value="mixed">Gemischt</option>
            <option value="unknown">Unbekannt</option>
          </select>
          <input
            type="date"
            placeholder="Von"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className="bg-background rounded border px-3 py-2 text-sm"
          />
          <input
            type="date"
            placeholder="Bis"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="bg-background rounded border px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {/* Pipeline Results */}
        {pipelineResult && <PipelinePanel result={pipelineResult} />}

        {results.length > 0 && (
          <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
            <span>
              {total} Treffer · Modus:{" "}
              {mode === "hybrid" ? "Hybrid (BM25 + Vector + Citation)" : "BM25 (Volltext)"}
              {reranked && " · Reranked"}
              {rerankModel && ` (${rerankModel})`}
            </span>
          </div>
        )}

        {results.length === 0 && !loading && !pipelineLoading && query && (
          <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
            <Search className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Keine Treffer — versuchen Sie eine andere Suchanfrage.</p>
          </div>
        )}

        {results.length === 0 && !loading && !pipelineLoading && !query && (
          <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
            <Landmark className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Suchen Sie nach Urteilen, Aktenzeichen oder Rechtsgebieten.</p>
            <p className="mt-1 text-xs">Hybrid-Suche: BM25 + Vector + Citation Graph</p>
            {rerank && <p className="text-primary text-xs">Cross-Encoder Reranking aktiv</p>}
            {pipelineMode && <p className="text-primary text-xs">Multi-Agent Pipeline aktiv</p>}
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
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
      <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md">
        {icon}
      </div>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
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
      className="bg-card hover:border-primary/50 hover:bg-accent/30 w-full rounded-lg border p-4 text-left transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{result.court}</span>
            {result.file_number && (
              <span className="text-muted-foreground text-xs">— {result.file_number}</span>
            )}
            {result.decision_date && (
              <span className="text-muted-foreground text-xs">
                · {new Date(result.decision_date).toLocaleDateString("de-DE")}
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-sm font-medium">{result.title}</h3>
          {result.snippet && (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{result.snippet}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className={cn("flex items-center gap-1 rounded px-2 py-0.5", treatmentColor)}>
              <TreatmentIcon className="h-3 w-3" />
              {TREATMENT_LABELS[result.treatment_status]?.de ?? result.treatment_status}
            </span>
            {result.citation_count > 0 && (
              <span className="text-muted-foreground flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {result.citation_count} Zitate
              </span>
            )}
            {result.source === "hybrid" && (
              <span className="flex items-center gap-1 text-blue-500">
                <TrendingUp className="h-3 w-3" />
                Hybrid
              </span>
            )}
            {result.rerank_score !== undefined && (
              <span
                className="flex items-center gap-1 text-purple-500"
                title={result.rerank_reason}
              >
                <Sparkles className="h-3 w-3" />
                {result.rerank_score.toFixed(1)}/10
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="text-muted-foreground h-5 w-5 shrink-0" />
      </div>
    </button>
  );
}

function PipelinePanel({ result }: { result: PipelineResultData }) {
  const agentIcons: Record<string, typeof Brain> = {
    router: Brain,
    retrieval: Search,
    validation: CheckCircle2,
    synthesis: Sparkles,
  };

  const agentLabels: Record<string, string> = {
    router: "Query Router",
    retrieval: "Retrieval",
    validation: "Validation",
    synthesis: "Synthesis",
  };

  return (
    <div className="mb-6 space-y-4">
      {/* Pipeline Steps */}
      <div className="bg-card rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Brain className="text-primary h-4 w-4" />
            Multi-Agent Pipeline
          </h3>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {(result.total_duration_ms / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {result.steps.map((step, i) => {
            const Icon = agentIcons[step.agent] ?? Brain;
            const label = agentLabels[step.agent] ?? step.agent;
            return (
              <div
                key={i}
                className={cn(
                  "rounded border p-2 text-xs",
                  step.status === "done" &&
                    "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
                  step.status === "error" &&
                    "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
                  step.status === "running" &&
                    "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30",
                  step.status === "pending" && "border-muted bg-muted/30"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3" />
                  <span className="font-medium">{label}</span>
                  {step.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {step.status === "done" && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                  {step.status === "error" && <XCircle className="h-3 w-3 text-red-500" />}
                </div>
                {step.duration_ms !== undefined && (
                  <p className="text-muted-foreground mt-0.5">
                    {(step.duration_ms / 1000).toFixed(1)}s
                  </p>
                )}
                {step.error && <p className="mt-0.5 truncate text-red-500">{step.error}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Routing Info */}
      {result.routing && (
        <div className="bg-card rounded-lg border p-4">
          <h4 className="text-muted-foreground mb-2 text-xs font-medium">Query Routing</h4>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-primary/10 text-primary rounded px-2 py-0.5 font-medium">
              {result.routing.intent}
            </span>
            <span className="bg-muted rounded px-2 py-0.5">
              Strategy: {result.routing.search_strategy}
            </span>
            {result.routing.legal_concepts.map((concept, i) => (
              <span key={i} className="bg-muted rounded px-2 py-0.5">
                {concept}
              </span>
            ))}
          </div>
          {result.routing.expanded_query !== result.query && (
            <p className="text-muted-foreground mt-2 text-xs italic">
              Expanded: &quot;{result.routing.expanded_query}&quot;
            </p>
          )}
        </div>
      )}

      {/* Validation Summary */}
      {result.validation_summary && (
        <div className="bg-card rounded-lg border p-4">
          <h4 className="text-muted-foreground mb-2 text-xs font-medium">Citation Validation</h4>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              {result.validation_summary.good_law} Good Law
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" />
              {result.validation_summary.bad_law} Bad Law
            </span>
            <span className="flex items-center gap-1 text-orange-600">
              <AlertTriangle className="h-3 w-3" />
              {result.validation_summary.at_risk} At Risk
            </span>
            <span className="flex items-center gap-1 text-gray-500">
              <HelpCircle className="h-3 w-3" />
              {result.validation_summary.unknown} Unknown
            </span>
          </div>
        </div>
      )}

      {/* Synthesized Answer */}
      {result.answer && (
        <div className="bg-card rounded-lg border p-4">
          <h4 className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium">
            <Sparkles className="text-primary h-3 w-3" />
            Synthesized Answer
          </h4>
          <div className="prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap">
            {result.answer}
          </div>
        </div>
      )}

      {/* Citations */}
      {result.citations.length > 0 && (
        <div className="bg-card rounded-lg border p-4">
          <h4 className="text-muted-foreground mb-2 text-xs font-medium">Citations</h4>
          <div className="space-y-1">
            {result.citations.slice(0, 10).map((cite, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate">
                  [{i + 1}] {cite.court} — {cite.title}
                  {cite.file_number && ` (${cite.file_number})`}
                </span>
                <span className="text-muted-foreground ml-2 shrink-0">{cite.treatment}</span>
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
    <div className="flex h-full flex-col p-4 md:p-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Suche
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Scale className="h-4 w-4" />
          {detail.court}
          {detail.file_number && <span>— {detail.file_number}</span>}
          {detail.decision_date && (
            <span>· {new Date(detail.decision_date).toLocaleDateString("de-DE")}</span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold">{detail.title}</h1>
        {detail.ecli && <p className="text-muted-foreground mt-1 text-xs">ECLI: {detail.ecli}</p>}
      </div>

      {/* Treatment Status */}
      <div className={cn("mb-6 rounded-lg border p-4", treatmentColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TreatmentIcon className="h-5 w-5" />
            <span className="font-medium">
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
            className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-white/50 dark:hover:bg-black/30"
          >
            {validating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Validieren
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
          <h2 className="mb-2 text-sm font-medium">Volltext</h2>
          <div className="bg-card max-h-96 overflow-y-auto rounded-lg border p-4 text-sm leading-relaxed">
            {detail.content.slice(0, 5000)}
            {detail.content.length > 5000 && (
              <p className="text-muted-foreground mt-2 text-xs">
                ... ({detail.content.length - 5000} weitere Zeichen)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Citation Graph */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Outgoing */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <GitBranch className="h-4 w-4" />
            Zitiert ({detail.citation_graph.outgoing.length})
          </h2>
          <div className="space-y-2">
            {detail.citation_graph.outgoing.length === 0 ? (
              <p className="text-muted-foreground text-xs">Keine Zitate extrahiert.</p>
            ) : (
              detail.citation_graph.outgoing
                .slice(0, 20)
                .map((cite, i) => <CitationItem key={i} cite={cite} direction="outgoing" />)
            )}
          </div>
        </div>

        {/* Incoming */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" />
            Wird zitiert von ({detail.citation_graph.incoming.length})
          </h2>
          <div className="space-y-2">
            {detail.citation_graph.incoming.length === 0 ? (
              <p className="text-muted-foreground text-xs">Keine eingehenden Zitate.</p>
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

function CitationItem({
  cite,
  direction,
}: {
  cite: CitationNode;
  direction: "outgoing" | "incoming";
}) {
  const treatmentColors: Record<string, string> = {
    positive: "text-emerald-600",
    negative: "text-red-600",
    neutral: "text-gray-500",
    distinguishing: "text-yellow-600",
    overruled: "text-red-700",
    unknown: "text-gray-400",
  };

  return (
    <div className="bg-card rounded border p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{cite.reference}</span>
        <span
          className={cn("font-medium", treatmentColors[cite.treatment] ?? treatmentColors.unknown)}
        >
          {cite.treatment}
        </span>
      </div>
      {(cite.court || cite.decision_date) && (
        <p className="text-muted-foreground mt-1">
          {cite.court}
          {cite.decision_date && ` · ${new Date(cite.decision_date).toLocaleDateString("de-DE")}`}
        </p>
      )}
      {cite.context && (
        <p className="text-muted-foreground mt-1 line-clamp-2 italic">
          &ldquo;{cite.context.slice(0, 200)}&rdquo;
        </p>
      )}
    </div>
  );
}
