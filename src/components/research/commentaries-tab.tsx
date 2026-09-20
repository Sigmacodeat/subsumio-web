"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Search,
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
  ExternalLink,
  Gavel,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import { CitationPanel } from "@/components/legal/CitationPanel";
import { EmptyState } from "@/components/dashboard/empty-state";

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
  { value: "at", label: "Österreich" },
  { value: "eu", label: "EU" },
];

const COMMENTARY_TYPES = [
  { value: "", label: "Alle" },
  { value: "synthetic", label: "KI-erstellt" },
  { value: "open_access", label: "Frei zugänglich" },
];

export default function CommentariesPage() {
  const confirm = useConfirm();
  const { addToast } = useToast();
  useLang();
  const [commentaries, setCommentaries] = useState<Commentary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [jurisdiction, setJurisdiction] = useState("at");
  const [commentaryType, setCommentaryType] = useState("");
  const [statuteFilter, setStatuteFilter] = useState("");
  const [selectedCommentary, setSelectedCommentary] = useState<Commentary | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthStatute, setSynthStatute] = useState("");
  const [synthSection, setSynthSection] = useState("");
  const [synthJurisdiction, setSynthJurisdiction] = useState("at");
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
    } catch {
      setError("Die Kommentierungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.");
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
      addToast({ type: "success", description: "Kommentierung erstellt" });
    } catch {
      setError(
        "Der Assistent ist gerade nicht erreichbar. Bitte versuchen Sie es in einigen Minuten erneut."
      );
      addToast({ type: "error", description: "Kommentierung konnte nicht erstellt werden" });
    } finally {
      setSynthesizing(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ message: "Kommentierung wirklich löschen?" });
    if (!ok) return;
    try {
      await api.legal.commentaries.delete(id);
      setSelectedCommentary(null);
      await fetchCommentaries();
      addToast({ type: "success", description: "Kommentierung gelöscht" });
    } catch {
      addToast({ type: "error", description: "Löschen fehlgeschlagen" });
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
    // Embedded in the research page, which owns the page header (one h1 per page).
    <div>
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Kommentierungen zu Paragraphen — frei zugängliche Quellen und KI-erstellte Entwürfe
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSynthForm(!showSynthForm)}
            className="gap-2 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            Kommentierung erstellen
          </Button>
        </div>

        {showSynthForm && (
          <div className="mb-6 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold">KI-Kommentierung zu einem Paragraphen</h3>
            <div className="flex flex-wrap gap-3">
              <select
                value={synthJurisdiction}
                onChange={(e) => setSynthJurisdiction(e.target.value)}
                aria-label="Rechtsordnung"
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              >
                <option value="at">Österreich</option>
                <option value="eu">EU-Recht</option>
              </select>
              <input
                type="text"
                placeholder="Gesetz (z. B. ABGB)"
                aria-label="Gesetz"
                value={synthStatute}
                onChange={(e) => setSynthStatute(e.target.value.toUpperCase())}
                className="w-32 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="§ (z. B. 1295)"
                aria-label="Paragraph"
                value={synthSection}
                onChange={(e) => setSynthSection(e.target.value)}
                className="w-32 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              />
              <Button
                onClick={handleSynthesize}
                disabled={!synthStatute || !synthSection || synthesizing}
                className="gap-2 whitespace-nowrap"
              >
                {synthesizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Erstellen
              </Button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
            <input
              type="text"
              placeholder="Suche nach §, Gesetz, Schlagwort …"
              aria-label="Kommentierungen durchsuchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-4 pl-10 text-sm"
            />
          </div>
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            aria-label="Rechtsordnung"
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
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
            aria-label="Art der Kommentierung"
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
          >
            {COMMENTARY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Gesetz (z. B. ABGB)"
            aria-label="Nach Gesetz filtern"
            value={statuteFilter}
            onChange={(e) => setStatuteFilter(e.target.value.toUpperCase())}
            className="w-32 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
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
        {total > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[color:var(--ds-text-muted)] tabular-nums">
            <span>{total} Kommentierungen</span>
            <span>·</span>
            <span>{groupedByStatute.length} Gesetze</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {commentaries.filter((c) => c.commentary_type === "synthetic").length} KI-erstellt
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {commentaries.filter((c) => c.commentary_type === "open_access").length} frei
              zugänglich
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-sm text-[color:var(--ds-danger-text)]">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && commentaries.length === 0 && !error && (
          <EmptyState
            icon={BookOpen}
            title="Keine Kommentierungen gefunden"
            description="Für die aktuellen Filter wurden noch keine Kommentierungen erstellt."
            actionLabel="Kommentierung erstellen"
            onAction={() => setShowSynthForm(true)}
          />
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
    <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-[color:var(--ds-hover)]"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
        )}
        <Scale className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
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
              <span className="w-20 shrink-0 text-sm tabular-nums">§&#8239;{c.section_num}</span>
              <span className="flex-1 truncate text-sm text-[color:var(--ds-text-muted)]">
                {c.title}
              </span>
              <CommentaryTypeBadge synthetic={c.commentary_type === "synthetic"} />
              {c.case_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                  <Gavel className="h-3 w-3" />
                  {c.case_count}
                </span>
              )}
              {c.treatment_summary &&
                (c.treatment_summary.bad_law > 0 || c.treatment_summary.at_risk > 0) && (
                  <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--ds-warning-text)]" />
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
  const { grounding, groundAnswer } = useGroundedAnswer();
  const isSynthetic = commentary.commentary_type === "synthetic";

  useEffect(() => {
    if (!isSynthetic) return;
    const text = [commentary.content, ...(commentary.key_holdings ?? [])].filter(Boolean).join(" ");
    if (text.trim()) void groundAnswer(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentary.id, isSynthetic]);

  return (
    <div>
      <div className="max-w-4xl">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </button>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <CommentaryTypeBadge synthetic={commentary.commentary_type === "synthetic"} />
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {commentary.jurisdiction.toUpperCase()} · {commentary.statute_abbr} ·{" "}
                  §&#8239;{commentary.section_num}
                </span>
              </div>
              {/* h2: the research page owns the only h1. */}
              <h2 className="font-display text-xl font-semibold">{commentary.title}</h2>
              {commentary.source_name && (
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  Quelle: {commentary.source_name}
                </p>
              )}
            </div>
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-danger-border)] px-3 py-1.5 text-sm text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-solid)] hover:text-white"
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

          {isSynthetic && (
            <div className="mt-4">
              <CitationPanel data={{ grounding, citations: [], isStreaming: false }} compact />
            </div>
          )}

          {/* Key holdings */}
          {commentary.key_holdings && commentary.key_holdings.length > 0 && (
            <div className="mt-6 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-4">
              <h3 className="mb-3 text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase">
                Kernaussagen
              </h3>
              <ul className="space-y-2">
                {commentary.key_holdings.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ds-text-muted)]" />
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
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ds-text)] hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Originalquelle öffnen
              </a>
            </div>
          )}

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
            {commentary.case_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Gavel className="h-3 w-3" />
                {commentary.case_count} verlinkte Urteile
              </span>
            )}
            <span>Aktualisiert: {formatDate(commentary.updated_at)}</span>
            {commentary.generated_at && <span>Erstellt: {formatDate(commentary.generated_at)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentaryTypeBadge({ synthetic }: { synthetic: boolean }) {
  return synthetic ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-warning-text)]">
      <Sparkles className="h-3 w-3" />
      KI-erstellt
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
      <FileText className="h-3 w-3" />
      Frei zugänglich
    </span>
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
    green: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
    red: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
    amber: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
    blue: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
    gray: "bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
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
