"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Loader2,
  AlertTriangle,
  Landmark,
  Scale,
  CheckCircle2,
  Calendar,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { PrecedentSearchResponse } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useLang } from "@/lib/use-lang";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";

interface PipelinePrecedentPage {
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

/** Lists the precedent analyses the case pipeline already computed
 * (precedent-matches/{caseSlug} pages, see legal-pipeline.ts) so an existing
 * result is the starting point before paying for a fresh on-demand search. */
function PipelinePrecedentSection({ lang }: { lang: string }) {
  const [pages, setPages] = useState<PipelinePrecedentPage[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.brain.listPages({
          slugPrefix: "precedent-matches/",
          limit: 20,
        });
        if (!cancelled) {
          setPages(
            result.map((p) => ({
              slug: p.slug,
              title: p.title,
              content: p.content ?? "",
              updated_at: p.updated_at,
            }))
          );
        }
      } catch {
        if (!cancelled) setPages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // listPages omits page content — fetch the full page on first expand.
  async function toggleExpand(slug: string, hasContent: boolean) {
    const next = expanded === slug ? null : slug;
    setExpanded(next);
    if (next && !hasContent) {
      try {
        const full = await api.brain.getPage(slug);
        setPages((prev) =>
          prev.map((p) => (p.slug === slug ? { ...p, content: full.content ?? "" } : p))
        );
      } catch {
        // keep the card usable without content
      }
    }
  }

  if (pages.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-[color:var(--ds-text-muted)]" />
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {lang === "en"
            ? "Automatic precedent analyses from your case pipelines"
            : "Automatische Präzedenzfall-Analysen aus Ihren Akten"}
        </h3>
        <Badge variant="default" className="text-xs tabular-nums">
          {pages.length}
        </Badge>
      </div>
      <p className="text-xs text-[color:var(--ds-text-muted)]">
        {lang === "en"
          ? "These were already computed during case analysis — check them before running a new search."
          : "Diese wurden bei der Aktenanalyse bereits berechnet — erst hier nachsehen, bevor eine neue Suche gestartet wird."}
      </p>
      <div className="space-y-2">
        {pages.map((p) => {
          const caseSlug = p.slug.replace(/^precedent-matches\//, "");
          const isOpen = expanded === p.slug;
          return (
            <div
              key={p.slug}
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]"
            >
              <button
                onClick={() => void toggleExpand(p.slug, p.content.length > 0)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                aria-expanded={isOpen}
              >
                <ChevronRight
                  size={14}
                  className={`shrink-0 text-[color:var(--ds-text-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                <span className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                  {p.title}
                </span>
                <span className="ml-auto shrink-0 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                  {formatDate(p.updated_at)}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-[color:var(--ds-border)] p-3">
                  <div className="max-h-[300px] overflow-y-auto rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-2">
                    <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                      {p.content}
                    </pre>
                  </div>
                  <a
                    href={`/dashboard/cases/${encodeURIComponent(caseSlug)}`}
                    className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
                  >
                    <CheckCircle2 size={12} />
                    {lang === "en" ? "Open case" : "Zur Akte"}
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PrecedentSearchPage() {
  const { t, lang } = useLang();
  const [query, setQuery] = useState("");
  const jurisdiction = "at" as const;
  const [legalArea, setLegalArea] = useState("");
  const [limit, setLimit] = useState(10);
  const [result, setResult] = useState<PrecedentSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { grounding, isGrounding, groundAnswer } = useGroundedAnswer();

  useEffect(() => {
    if (!result || result.results.length === 0) return;
    const groundingText = result.results
      .map((r) => `${r.court} ${r.date} — ${r.title} — ${r.keyHolding}`)
      .join("\n\n");
    groundAnswer(groundingText).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  async function run() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.precedentSearch({
        query: query.trim(),
        jurisdiction,
        ...(legalArea.trim() ? { legal_area: legalArea.trim() } : {}),
        limit,
      });
      setResult(res);
    } catch {
      setError(t("precedent.err_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    // Embedded in the research page, which owns the page header (one h1 per page).
    <div className="space-y-6">
      {/* Search form */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("precedent.search_placeholder")}
              aria-label={t("precedent.search_placeholder")}
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 text-[color:var(--ds-text)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
            />
          </div>
          <Button
            onClick={run}
            disabled={loading || !query.trim()}
            className="gap-2 whitespace-nowrap"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {t("precedent.search_btn")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Jurisdiction */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("precedent.jurisdiction")}
            </span>
            <span className="rounded-md border border-[color:var(--ds-border)] px-2.5 py-1 text-xs font-medium text-[color:var(--ds-text)]">
              Österreich
            </span>
          </div>

          {/* Legal area */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="precedent-area"
              className="text-xs font-medium text-[color:var(--ds-text-muted)]"
            >
              {t("precedent.legal_area")}
            </label>
            <Input
              id="precedent-area"
              value={legalArea}
              onChange={(e) => setLegalArea(e.target.value)}
              placeholder={t("precedent.legal_area_placeholder")}
              className="h-7 w-32 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-xs text-[color:var(--ds-text)]"
            />
          </div>

          {/* Limit */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="precedent-limit"
              className="text-xs font-medium text-[color:var(--ds-text-muted)]"
            >
              {t("precedent.max_results")}
            </label>
            <select
              id="precedent-limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-7 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 text-xs text-[color:var(--ds-text)]"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Already-computed pipeline precedent analyses */}
      <PipelinePrecedentSection lang={lang} />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-[color:var(--ds-text-muted)]">
              {result.total} {t("precedent.results_count")}
            </span>
            {result.warnings && result.warnings.length > 0 && (
              <span className="text-xs text-[color:var(--ds-warning-text)]">
                {result.warnings.join(", ")}
              </span>
            )}
          </div>

          {result.results.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title={t("precedent.empty_title")}
              description={t("precedent.empty_desc")}
              actionLabel="Suche zurücksetzen"
              onAction={() => {
                setQuery("");
                setResult(null);
              }}
            />
          ) : (
            <div className="space-y-2">
              {result.results.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[background-color,border-color,color] hover:border-[color:var(--ds-border-strong)] motion-reduce:transition-none"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                        {r.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                        <Landmark size={12} />
                        <span>{r.court}</span>
                        <Calendar size={12} className="ml-1" />
                        <span className="tabular-nums">{formatDate(r.date)}</span>
                        {r.legalArea && (
                          <>
                            <Scale size={12} className="ml-1" />
                            <span>{r.legalArea}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                          <div
                            className="h-full bg-[color:var(--ds-text-muted)]"
                            style={{ width: `${Math.round(r.relevanceScore * 100)}%` }}
                          />
                        </div>
                        <span
                          className="text-xs text-[color:var(--ds-text-muted)] tabular-nums"
                          title="Relevanz"
                        >
                          {Math.round(r.relevanceScore * 100)} %
                        </span>
                      </div>
                      <Badge
                        variant="default"
                        className={cn(
                          "border text-xs",
                          "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                        )}
                      >
                        {r.source === "internal"
                          ? t("precedent.source_internal")
                          : t("precedent.source_external")}
                      </Badge>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-[color:var(--ds-text-muted)]">
                    {r.keyHolding}
                  </p>
                  {r.caseRef && (
                    <a
                      href={`/dashboard/cases/${encodeURIComponent(r.caseRef)}`}
                      className="mt-2 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      <CheckCircle2 size={12} /> {t("precedent.to_case")}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <CitationPanel
            data={
              {
                grounding: grounding ?? null,
                citations: [],
                isStreaming: isGrounding,
              } satisfies CitationPanelData
            }
            compact
          />
        </div>
      )}
    </div>
  );
}
