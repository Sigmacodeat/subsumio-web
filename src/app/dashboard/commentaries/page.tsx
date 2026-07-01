"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  BookOpen,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  FileText,
  Scale,
  ArrowLeft,
  Trash2,
  Brain,
  ExternalLink,
  Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { api } from "@/lib/api";

interface Commentary {
  id: string;
  jurisdiction: string;
  statute_abbr: string;
  section_num: string;
  commentary_type: "synthetic" | "open_access";
  title: string;
  content: string;
  statute_text: string | null;
  source_model: string | null;
  source_url: string | null;
  source_name: string | null;
  case_count: number;
  linked_cases: string[] | null;
  treatment_summary: {
    good_law: number;
    bad_law: number;
    at_risk: number;
    mixed: number;
    unknown: number;
  } | null;
  key_holdings: string[] | null;
  keywords: string[] | null;
  generated_at: string | null;
  updated_at: string;
}

interface CommentaryListResponse {
  items: Commentary[];
  total: number;
}

const JURISDICTIONS = [
  { value: "", label: "Alle" },
  { value: "at", label: "Österreich" },
  { value: "de", label: "Deutschland" },
  { value: "ch", label: "Schweiz" },
  { value: "eu", label: "EU" },
];

const COMMENTARY_TYPES = [
  { value: "", label: "Alle" },
  { value: "synthetic", label: "Synthetisch" },
  { value: "open_access", label: "Open Access" },
];

export default function CommentariesPage() {
  const [commentaries, setCommentaries] = useState<Commentary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [commentaryType, setCommentaryType] = useState("");
  const [statuteFilter, setStatuteFilter] = useState("");
  const [selectedCommentary, setSelectedCommentary] = useState<Commentary | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthStatute, setSynthStatute] = useState("");
  const [synthSection, setSynthSection] = useState("");
  const [synthJurisdiction, setSynthJurisdiction] = useState("de");
  const [showSynthForm, setShowSynthForm] = useState(false);

  const fetchCommentaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.legal.commentaries.list({
        jurisdiction: jurisdiction || undefined,
        commentaryType: commentaryType || undefined,
        statuteAbbr: statuteFilter || undefined,
        search: search || undefined,
        limit: 100,
      });
      setCommentaries((res as unknown as CommentaryListResponse).items ?? []);
      setTotal((res as unknown as CommentaryListResponse).total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [jurisdiction, commentaryType, statuteFilter, search]);

  useEffect(() => {
    fetchCommentaries();
  }, [fetchCommentaries]);

  // Group commentaries by statute
  const groupedByStatute = useMemo(() => {
    const groups: Record<string, Commentary[]> = {};
    for (const c of commentaries) {
      const key = `${c.jurisdiction}/${c.statute_abbr}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    // Sort each group by section number
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const aNum = parseInt(a.section_num.replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(b.section_num.replace(/\D/g, ""), 10) || 0;
        return aNum - bNum;
      });
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [commentaries]);

  const handleSynthesize = async () => {
    if (!synthStatute || !synthSection) return;
    setSynthesizing(true);
    setError(null);
    try {
      await api.legal.commentaries.triggerSynthesis({
        statuteAbbr: synthStatute,
        sectionNum: synthSection,
        jurisdiction: synthJurisdiction,
      });
      setShowSynthForm(false);
      setSynthStatute("");
      setSynthSection("");
      await fetchCommentaries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synthese fehlgeschlagen");
    } finally {
      setSynthesizing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Kommentierung wirklich löschen?")) return;
    try {
      await api.legal.commentaries.delete(id);
      setSelectedCommentary(null);
      await fetchCommentaries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  };

  if (selectedCommentary) {
    return (
      <CommentaryDetail
        commentary={selectedCommentary}
        onBack={() => setSelectedCommentary(null)}
        onDelete={() => handleDelete(selectedCommentary.id)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--ds-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title="Kommentierungen"
          description="Synthetische und Open-Access-Kommentierungen pro Paragraph"
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kommentierungen" }]}
          actions={
            <button
              onClick={() => setShowSynthForm(!showSynthForm)}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--ds-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              Synthese triggern
            </button>
          }
        />

        {showSynthForm && (
          <div className="mb-6 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-card)] p-4">
            <h3 className="mb-3 text-sm font-semibold">Synthetische Kommentierung generieren</h3>
            <div className="flex flex-wrap gap-3">
              <select
                value={synthJurisdiction}
                onChange={(e) => setSynthJurisdiction(e.target.value)}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-input-bg)] px-3 py-2 text-sm"
              >
                <option value="de">DE</option>
                <option value="at">AT</option>
                <option value="ch">CH</option>
              </select>
              <input
                type="text"
                placeholder="Gesetz (z.B. BGB)"
                value={synthStatute}
                onChange={(e) => setSynthStatute(e.target.value.toUpperCase())}
                className="w-32 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-input-bg)] px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="§ (z.B. 823)"
                value={synthSection}
                onChange={(e) => setSynthSection(e.target.value)}
                className="w-32 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-input-bg)] px-3 py-2 text-sm"
              />
              <button
                onClick={handleSynthesize}
                disabled={!synthStatute || !synthSection || synthesizing}
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--ds-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {synthesizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generieren
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
            <input
              type="text"
              placeholder="Suche nach §, Gesetz, Schlagwort..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-input-bg)] py-2 pr-4 pl-10 text-sm"
            />
          </div>
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-input-bg)] px-3 py-2 text-sm"
          >
            {JURISDICTIONS.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </select>
          <select
            value={commentaryType}
            onChange={(e) => setCommentaryType(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-input-bg)] px-3 py-2 text-sm"
          >
            {COMMENTARY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Gesetz (z.B. ABGB)"
            value={statuteFilter}
            onChange={(e) => setStatuteFilter(e.target.value.toUpperCase())}
            className="w-32 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-input-bg)] px-3 py-2 text-sm"
          />
          <button
            onClick={fetchCommentaries}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-sm hover:bg-[color:var(--ds-hover)]"
          >
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>

        {/* Stats bar */}
        <div className="mb-4 flex items-center gap-4 text-sm text-[color:var(--ds-text-muted)]">
          <span>{total} Kommentierungen</span>
          <span>•</span>
          <span>{groupedByStatute.length} Gesetze</span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <Brain className="h-3.5 w-3.5" />
            {commentaries.filter((c) => c.commentary_type === "synthetic").length} synthetisch
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {commentaries.filter((c) => c.commentary_type === "open_access").length} Open Access
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && commentaries.length === 0 && !error && (
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-card)] py-16 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-[color:var(--ds-text-muted)]" />
            <h3 className="mb-2 text-lg font-semibold">Keine Kommentierungen gefunden</h3>
            <p className="mb-4 text-sm text-[color:var(--ds-text-muted)]">
              Es wurden noch keine Kommentierungen für die aktuellen Filter generiert.
            </p>
            <button
              onClick={() => setShowSynthForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--ds-accent)] px-4 py-2 text-sm font-medium text-white"
            >
              <Sparkles className="h-4 w-4" />
              Erste Kommentierung synthetisieren
            </button>
          </div>
        )}

        {/* Commentary tree grouped by statute */}
        {!loading && groupedByStatute.length > 0 && (
          <div className="space-y-4">
            {groupedByStatute.map(([statuteKey, sections]) => (
              <CommentaryStatuteGroup
                key={statuteKey}
                statuteKey={statuteKey}
                sections={sections}
                onSelect={setSelectedCommentary}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentaryStatuteGroup({
  statuteKey,
  sections,
  onSelect,
}: {
  statuteKey: string;
  sections: Commentary[];
  onSelect: (c: Commentary) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [jur, abbr] = statuteKey.split("/");

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-card)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-[color:var(--ds-hover)]"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
        )}
        <Scale className="h-4 w-4 text-[color:var(--ds-accent)]" />
        <span className="font-semibold">{abbr}</span>
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          {jur.toUpperCase()} · {sections.length} §
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-[color:var(--ds-border)]">
          {sections.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[color:var(--ds-hover)]"
            >
              <span className="w-20 font-mono text-sm">§ {c.section_num}</span>
              <span className="flex-1 truncate text-sm text-[color:var(--ds-text-muted)]">
                {c.title}
              </span>
              {c.commentary_type === "synthetic" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  <Brain className="h-3 w-3" />
                  Synthetisch
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <FileText className="h-3 w-3" />
                  Open Access
                </span>
              )}
              {c.case_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                  <Gavel className="h-3 w-3" />
                  {c.case_count}
                </span>
              )}
              {c.treatment_summary &&
                (c.treatment_summary.bad_law > 0 || c.treatment_summary.at_risk > 0) && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                )}
              <ChevronRight className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentaryDetail({
  commentary,
  onBack,
  onDelete,
}: {
  commentary: Commentary;
  onBack: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="min-h-screen bg-[color:var(--ds-bg)]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </button>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-card)] p-6">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                {commentary.commentary_type === "synthetic" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                    <Brain className="h-3 w-3" />
                    Synthetisch
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    <FileText className="h-3 w-3" />
                    Open Access
                  </span>
                )}
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {commentary.jurisdiction.toUpperCase()} · {commentary.statute_abbr} · §{" "}
                  {commentary.section_num}
                </span>
              </div>
              <h1 className="text-2xl font-bold">{commentary.title}</h1>
              {commentary.source_name && (
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  Quelle: {commentary.source_name}
                  {commentary.source_model && ` · Modell: ${commentary.source_model}`}
                </p>
              )}
            </div>
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
              Löschen
            </button>
          </div>

          {/* Treatment summary */}
          {commentary.treatment_summary && (
            <div className="mb-6 flex flex-wrap gap-3">
              <TreatmentBadge
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Gültig"
                count={commentary.treatment_summary.good_law}
                color="green"
              />
              <TreatmentBadge
                icon={<XCircle className="h-3.5 w-3.5" />}
                label="Überholt"
                count={commentary.treatment_summary.bad_law}
                color="red"
              />
              <TreatmentBadge
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="Angreifbar"
                count={commentary.treatment_summary.at_risk}
                color="amber"
              />
              <TreatmentBadge
                icon={<HelpCircle className="h-3.5 w-3.5" />}
                label="Gemischt"
                count={commentary.treatment_summary.mixed}
                color="blue"
              />
              <TreatmentBadge
                icon={<HelpCircle className="h-3.5 w-3.5" />}
                label="Unbekannt"
                count={commentary.treatment_summary.unknown}
                color="gray"
              />
            </div>
          )}

          {/* Statute text */}
          {commentary.statute_text && (
            <div className="mb-6 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-4">
              <h3 className="mb-2 text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase">
                Gesetzestext
              </h3>
              <p className="text-sm whitespace-pre-wrap">
                {commentary.statute_text.slice(0, 2000)}
              </p>
            </div>
          )}

          {/* Commentary content */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{commentary.content}</div>
          </div>

          {/* Key holdings */}
          {commentary.key_holdings && commentary.key_holdings.length > 0 && (
            <div className="mt-6 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-4">
              <h3 className="mb-3 text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase">
                Key Holdings
              </h3>
              <ul className="space-y-2">
                {commentary.key_holdings.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ds-accent)]" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Keywords */}
          {commentary.keywords && commentary.keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {commentary.keywords.map((k, i) => (
                <span
                  key={i}
                  className="rounded-full bg-[color:var(--ds-hover)] px-2.5 py-1 text-xs text-[color:var(--ds-text-muted)]"
                >
                  {k}
                </span>
              ))}
            </div>
          )}

          {/* Source link */}
          {commentary.source_url && (
            <div className="mt-6 border-t border-[color:var(--ds-border)] pt-4">
              <a
                href={commentary.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ds-accent)] hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Originalquelle öffnen
              </a>
            </div>
          )}

          {/* Meta */}
          <div className="mt-4 flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
            {commentary.case_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Gavel className="h-3 w-3" />
                {commentary.case_count} verlinkte Urteile
              </span>
            )}
            <span>Aktualisiert: {new Date(commentary.updated_at).toLocaleDateString("de-DE")}</span>
            {commentary.generated_at && (
              <span>
                Generiert: {new Date(commentary.generated_at).toLocaleDateString("de-DE")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TreatmentBadge({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: "green" | "red" | "amber" | "blue" | "gray";
}) {
  if (count === 0) return null;
  const colors: Record<string, string> = {
    green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        colors[color]
      )}
    >
      {icon}
      {label}: {count}
    </span>
  );
}
