"use client";

import { useState } from "react";
import { useLang } from "@/lib/use-lang";
import { Landmark, Search, Loader2, ExternalLink, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { frontmatterOf, type DecisionFrontmatter } from "@/lib/legal-types";
import { EmptyState } from "@/components/dashboard/empty-state";

interface JudgementResult {
  id: string;
  title: string;
  court: string;
  date: string;
  ecli?: string;
  az?: string;
  legalArea: string;
  keywords: string[];
  summary: string;
  url: string;
  source: string;
}

export default function RechtsprechungPage() {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<JudgementResult[]>([]);
  const jurisdiction = "at" as const;
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    setResults([]);

    try {
      const judgements: JudgementResult[] = [];

      // 1. Search brain for existing court decisions
      const brainResults = await api.brain.search(query, 20);
      for (const page of brainResults) {
        const fm = frontmatterOf<DecisionFrontmatter>(page);
        if (fm.type === "court_decision" || (page as { type?: string }).type === "court_decision") {
          judgements.push({
            id: page.slug,
            title: page.title,
            court: fm.court || "Unbekannt",
            date: fm.date || page.created_at || "",
            ecli: fm.ecli || undefined,
            az: fm.case_number || undefined,
            legalArea: fm.legal_area || "Allgemein",
            keywords: fm.keywords || [],
            summary: page.snippet || "",
            url: fm.source_url || "#",
            source: "brain",
          });
        }
      }

      // 2. Live-Suche: österreichische RIS-OGD-Quellen
      try {
        const liveData = await api.legal.judgementsSearch({ q: query, jurisdiction, limit: 20 });
        for (const r of liveData.results ?? []) {
          judgements.push({
            id: `${r.source || "live"}-${r.ecli || r.caseNumber || Math.random().toString(36)}`,
            title: r.title || "Urteil",
            court: r.court || "Unbekannt",
            date: r.date || "",
            ecli: r.ecli || undefined,
            az: r.caseNumber || undefined,
            legalArea: "Allgemein",
            keywords: [],
            summary: r.snippet || "",
            url: r.url || "#",
            source: r.source || "live",
          });
        }
      } catch {
        // Externe Quellen können offline sein — Treffer aus dem Kanzleiwissen bleiben
      }

      // No AI fallback: a model asked to "find" decisions invents Geschäftszahlen
      // and ECLIs. Only the firm's knowledge and the RIS return decisions here.
      setResults(judgements);

    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    // Embedded in the research page, which owns the page header (one h1 per page).
    <div className="space-y-6">
      {/* Search */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Entscheidungen österreichischer Gerichte aus dem Kanzleiwissen und dem RIS
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Entscheidung suchen … z. B. Haftung, Vertragsbruch, Datenschutz"
              aria-label={t("aria.search_judgements")}
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            variant="primary"
            className="gap-2 whitespace-nowrap"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Suchen
          </Button>
        </div>
      </div>

      {/* Results */}
      {searched && results.length === 0 && !searching && (
        <EmptyState
          icon={Landmark}
          title="Keine Entscheidungen gefunden"
          description="Versuchen Sie andere oder allgemeinere Suchbegriffe."
          actionLabel="Suche zurücksetzen"
          onAction={() => {
            setQuery("");
            setSearched(false);
          }}
        />
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[color:var(--ds-text-muted)]">{results.length} Ergebnisse</p>
          </div>
          {results.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[color:var(--ds-text)]">{r.title}</span>
                    <Badge
                      variant="default"
                      className={cn(
                        "border text-xs",
                        "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {r.source === "brain"
                        ? "Kanzleiwissen"
                        : r.source === "ris-ogd"
                          ? "RIS"
                          : r.source === "opencaselaw"
                            ? "OpenCaseLaw"
                            : r.source === "openlegaldata"
                              ? "OpenLegalData"
                              : r.source}
                    </Badge>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ds-text-muted)]">
                    <span className="flex items-center gap-1">
                      <Landmark size={10} />
                      {r.court}
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Calendar size={10} />
                      {formatDate(r.date)}
                    </span>
                    {r.az && <span className="tabular-nums">{r.az}</span>}
                    {r.ecli && <span className="break-all tabular-nums">{r.ecli}</span>}
                  </div>
                  <p className="line-clamp-3 text-sm text-[color:var(--ds-text-muted)]">
                    {r.summary}
                  </p>
                  {r.keywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.keywords.map((k) => (
                        <Badge
                          key={k}
                          variant="default"
                          className="text-xs"
                        >
                          {k}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {r.url !== "#" && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Entscheidung öffnen: ${r.title}`}
                    title="Entscheidung öffnen"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
