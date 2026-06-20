"use client";

import { useState } from "react";
import {
  Search,
  Loader2,
  AlertTriangle,
  Landmark,
  Scale,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { PrecedentSearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

export default function PrecedentSearchPage() {
  const [query, setQuery] = useState("");
  const [jurisdiction, setJurisdiction] = useState<"at" | "de" | "ch" | "all">("all");
  const [legalArea, setLegalArea] = useState("");
  const [limit, setLimit] = useState(10);
  const [result, setResult] = useState<PrecedentSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.precedentSearch({
        query: query.trim(),
        ...(jurisdiction !== "all" ? { jurisdiction } : {}),
        ...(legalArea.trim() ? { legal_area: legalArea.trim() } : {}),
        limit,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Präzedenzsuche fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Präzedenzsuche"
        description="Durchsucht interne Fallakten (legal_case pages) mit Keyword- + Vektor-Suche und bewertet Relevanz nach Rechtsgebiet, Datum und Ausgang"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Präzedenzsuche" }]}
      />

      {/* Search form */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechtsfrage, Sachverhalt oder Stichwort…"
              className="pl-9 bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)]"
              onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
            />
          </div>
          <Button onClick={run} disabled={loading || !query.trim()} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Suchen
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Jurisdiction */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--ds-text-muted)] font-medium">Rechtsordnung:</label>
            <div className="flex gap-1">
              {(["all", "at", "de", "ch"] as const).map((j) => (
                <button
                  key={j}
                  onClick={() => setJurisdiction(j)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    jurisdiction === j
                      ? "brand-soft brand-text border brand-border"
                      : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] border border-transparent",
                  )}
                >
                  {j === "all" ? "Alle" : j.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Legal area */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--ds-text-muted)] font-medium">Rechtsgebiet:</label>
            <Input
              value={legalArea}
              onChange={(e) => setLegalArea(e.target.value)}
              placeholder="z. B. Mietrecht"
              className="w-32 h-7 text-xs bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)]"
            />
          </div>

          {/* Limit */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--ds-text-muted)] font-medium">Max. Ergebnisse:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-7 text-xs bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-md text-[color:var(--ds-text)] px-2"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[color:var(--ds-text-muted)]">
              {result.total} Ergebnisse
            </span>
            {result.warnings && result.warnings.length > 0 && (
              <span className="text-xs text-amber-600">{result.warnings.join(", ")}</span>
            )}
          </div>

          {result.results.length === 0 ? (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8 text-center">
              <Landmark size={32} className="mx-auto text-[color:var(--ds-text-muted)] mb-2" />
              <p className="text-sm text-[color:var(--ds-text-muted)]">Keine Präzedenzfälle gefunden.</p>
              <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">
                Es wurden keine legal_case pages im Brain gefunden, die zur Suchanfrage passen.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {result.results.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 hover:border-[color:var(--ds-border-strong)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-[color:var(--ds-text)] truncate">{r.title}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-[color:var(--ds-text-muted)]">
                        <Landmark size={12} />
                        <span>{r.court}</span>
                        <Calendar size={12} className="ml-1" />
                        <span>{r.date}</span>
                        {r.legalArea && (
                          <>
                            <Scale size={12} className="ml-1" />
                            <span>{r.legalArea}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 rounded-full bg-[color:var(--ds-border)] overflow-hidden">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${Math.round(r.relevanceScore * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-[color:var(--ds-text-muted)]">
                          {Math.round(r.relevanceScore * 100)}%
                        </span>
                      </div>
                      <Badge
                        variant="default"
                        className={cn(
                          "text-xs border",
                          r.source === "internal"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-blue-500/10 text-blue-600 border-blue-500/20",
                        )}
                      >
                        {r.source === "internal" ? "Intern" : "Extern"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-[color:var(--ds-text-muted)] line-clamp-2">{r.keyHolding}</p>
                  {r.caseRef && (
                    <a
                      href={`/dashboard/cases/${r.caseRef}`}
                      className="text-xs brand-text hover:underline mt-2 inline-flex items-center gap-1"
                    >
                      <CheckCircle2 size={12} /> Zur Akte
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
