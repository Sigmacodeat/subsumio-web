"use client";

import { useState } from "react";
import { useLang } from "@/lib/use-lang";
import { Landmark, Search, Loader2, ExternalLink, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { frontmatterOf, type DecisionFrontmatter } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import type { GroundingMetadata } from "@/lib/citation-gate-client";

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
  const { t, lang } = useLang();
  const { groundAnswer } = useGroundedAnswer();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<JudgementResult[]>([]);
  const [jurisdiction, setJurisdiction] = useState<"at" | "de" | "ch" | "all">("at");
  const [searched, setSearched] = useState(false);
  const [aiGrounding, setAiGrounding] = useState<GroundingMetadata | null>(null);
  const [hasAiResults, setHasAiResults] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    setResults([]);
    setAiGrounding(null);
    setHasAiResults(false);

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

      // 2. Live-Suche: RIS-OGD (AT) + openlegaldata (DE) je nach Jurisdiktion
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
        // Externe Quellen können offline sein — Brain-Treffer + AI-Fallback bleiben
      }

      // 3. AI fallback if no results at all — structured JSON prompt
      if (judgements.length === 0) {
        setHasAiResults(false);
        const thinkResult = await api.query.think(
          `Suche nach Rechtsprechung zu "${query}" in ${jurisdiction === "at" ? "Österreich" : jurisdiction === "de" ? "Deutschland" : jurisdiction === "ch" ? "der Schweiz" : "Deutschland, Österreich und der Schweiz"}.

Antworte AUSSCHLIESSLICH als JSON-Array mit maximal 10 relevanten Urteilen. Kein Markdown, kein Text vor oder nach dem JSON.

Format pro Eintrag:
{
  "title": "Kurzer Titel des Urteils",
  "court": "Gericht (z.B. OGH, BGH, BVerfG, BGer)",
  "date": "YYYY-MM-DD",
  "az": "Aktenzeichen (z.B. 6 Ob 123/24a)",
  "ecli": "ECLI falls bekannt, sonst leerer String",
  "legalArea": "Rechtsgebiet (z.B. Zivilrecht, Strafrecht)",
  "keywords": ["Schlagwort1", "Schlagwort2"],
  "summary": "Kurze Zusammenfassung des Leitsatzes (max 300 Zeichen)",
  "url": "URL zum Urteil falls bekannt, sonst leerer String"
}`,
          {
            mode: "balanced",
            queryMode: "conservative",
          }
        );

        // Parse structured JSON response
        const raw = thinkResult.answer.trim();
        // Extract JSON array from response (handles cases where AI wraps in markdown code block)
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]) as Array<{
              title?: string;
              court?: string;
              date?: string;
              az?: string;
              ecli?: string;
              legalArea?: string;
              keywords?: string[];
              summary?: string;
              url?: string;
            }>;
            for (const entry of parsed) {
              if (!entry.title) continue;
              judgements.push({
                id: `ai-${judgements.length}`,
                title: entry.title,
                court: entry.court || "Unbekannt",
                date: entry.date || new Date().toISOString(),
                ecli: entry.ecli || undefined,
                az: entry.az || undefined,
                legalArea: entry.legalArea || "Allgemein",
                keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
                summary: entry.summary || "",
                url: entry.url || "#",
                source: "ai",
              });
            }
            if (judgements.length > 0) setHasAiResults(true);
          } catch {
            // JSON parse failed — no fallback to regex
          }
        }
      }

      setResults(judgements);

      // A.4: Ground AI fallback results — run corpus grounding on AI summaries
      if (hasAiResults) {
        const aiText = judgements
          .filter((j) => j.source === "ai")
          .map((j) => j.summary)
          .join(" ");
        if (aiText.trim()) {
          try {
            const grounding = await groundAnswer(aiText);
            setAiGrounding(grounding);
          } catch {
            setAiGrounding(null);
          }
        }
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Rechtsprechung"
        description="Urteile und Entscheidungen durchsuchen"
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "Rechtsprechung" }]}
      />

      {/* Search */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex gap-2">
          {(["at", "de", "ch", "all"] as const).map((j) => (
            <button
              key={j}
              onClick={() => setJurisdiction(j)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                jurisdiction === j
                  ? "brand-soft brand-border brand-text"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-muted)]"
              )}
            >
              {j === "at"
                ? "🇦🇹 Österreich"
                : j === "de"
                  ? "🇩🇪 Deutschland"
                  : j === "ch"
                    ? "🇨� Schweiz"
                    : "🌍 Alle"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Urteil suchen… z.B. Haftung, Vertragsbruch, Datenschutz"
              aria-label={t("aria.search_judgements")}
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            variant="primary"
            className="brand-bg brand-bg gap-2 text-white"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Suchen
          </Button>
        </div>
      </div>

      {/* Results */}
      {searched && results.length === 0 && !searching && (
        <div className="space-y-4 py-20 text-center">
          <Landmark size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <div>
            <p className="text-[color:var(--ds-text-muted)]">Keine Urteile im Brain gefunden.</p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
              Nutze den{" "}
              <code className="rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 font-mono text-xs">
                legal-judgements
              </code>{" "}
              Konnektor um Rechtsprechung zu importieren.
            </p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[color:var(--ds-text-muted)]">{results.length} Ergebnisse</p>
          </div>
          {results.map((r) => (
            <div
              key={r.id}
              className="hover:brand-border rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-[color:var(--ds-text)]">{r.title}</span>
                    <Badge
                      variant="default"
                      className={cn(
                        "border text-xs",
                        r.source === "brain"
                          ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                          : r.source === "ai"
                            ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                            : r.source === "ris-ogd"
                              ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                              : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {r.source === "brain"
                        ? "Brain"
                        : r.source === "ris-ogd"
                          ? "RIS-OGD"
                          : r.source === "opencaselaw"
                            ? "OpenCaseLaw"
                            : r.source === "openlegaldata"
                              ? "OpenLegalData"
                              : r.source === "ai"
                                ? "KI ⚠️ Verifizieren"
                                : r.source}
                    </Badge>
                  </div>
                  <div className="mb-2 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                    <span className="flex items-center gap-1">
                      <Landmark size={10} />
                      {r.court}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {new Date(r.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                    </span>
                    {r.az && <span className="font-mono">{r.az}</span>}
                    {r.ecli && <span className="font-mono text-xs">{r.ecli}</span>}
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
                          className="brand-soft brand-border/10 brand-text text-xs"
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
                    className="hover:brand-text hover:brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A.4: Grounding panel for AI-sourced results — mandatory for every AI output */}
      {hasAiResults && (
        <CitationPanel
          data={
            {
              grounding: aiGrounding ?? null,
              isStreaming: false,
            } satisfies CitationPanelData
          }
          compact
        />
      )}
    </div>
  );
}
