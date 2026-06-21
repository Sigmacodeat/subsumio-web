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
  const [jurisdiction, setJurisdiction] = useState<"at" | "de" | "ch" | "all">("at");
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

      // 3. AI fallback if no results at all
      if (judgements.length === 0) {
        const thinkResult = await api.query.think(
          `Suche nach Rechtsprechung zu "${query}" in ${jurisdiction === "at" ? "Österreich" : jurisdiction === "de" ? "Deutschland" : jurisdiction === "ch" ? "der Schweiz" : "Deutschland, Österreich und der Schweiz"}. Liste relevante Urteile mit Gericht, Datum, Aktenzeichen und Leitsatz.`,
          {
            mode: "balanced",
            queryMode: "external_law",
          }
        );
        const lines = thinkResult.answer.split("\n").filter((l) => l.trim());
        let current: Partial<JudgementResult> = {};
        for (const line of lines) {
          if (line.startsWith("##") || line.match(/^\d+\.\s/)) {
            if (current.title) {
              judgements.push({
                id: String(judgements.length),
                title: current.title || line.replace(/^\d+\.\s*/, "").replace(/^##\s*/, ""),
                court: current.court || "Unbekannt",
                date: current.date || new Date().toISOString(),
                ecli: current.ecli,
                az: current.az,
                legalArea: current.legalArea || "Allgemein",
                keywords: [],
                summary: current.summary || "",
                url: current.url || "#",
                source: "ai",
              });
            }
            current = { title: line.replace(/^\d+\.\s*/, "").replace(/^##\s*/, "") };
          } else if (
            line.toLowerCase().includes("gericht") ||
            line.toLowerCase().includes("court")
          ) {
            current.court = line.split(":")[1]?.trim() || line;
          } else if (line.toLowerCase().includes("datum") || line.toLowerCase().includes("date")) {
            current.date = line.split(":")[1]?.trim() || line;
          } else if (
            line.toLowerCase().includes("aktenzeichen") ||
            line.toLowerCase().includes("az")
          ) {
            current.az = line.split(":")[1]?.trim() || line;
          } else if (line.toLowerCase().includes("ecli")) {
            current.ecli = line.split(":")[1]?.trim() || line;
          } else {
            current.summary = (current.summary || "") + " " + line;
          }
        }
        if (current.title) {
          judgements.push({
            id: String(judgements.length),
            title: current.title,
            court: current.court || "Unbekannt",
            date: current.date || new Date().toISOString(),
            ecli: current.ecli,
            az: current.az,
            legalArea: current.legalArea || "Allgemein",
            keywords: [],
            summary: current.summary || "",
            url: current.url || "#",
            source: "ai",
          });
        }
      }

      setResults(judgements);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
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
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
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
              className="hover:brand-border rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-all"
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
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                          : r.source === "ris-ogd"
                            ? "border-blue-500/20 bg-blue-500/5 text-blue-600"
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
                                ? "KI"
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
                      {new Date(r.date).toLocaleDateString("de-DE")}
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
                    className="hover:brand-text hover:brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] transition-all"
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
