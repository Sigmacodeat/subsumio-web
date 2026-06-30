"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Search, Loader2, AlertTriangle, Scale, Gavel } from "lucide-react";

interface TaxPrecedentSearchPanelProps {
  initialQuery?: string;
}

interface Precedent {
  court: string;
  date: string;
  file_number: string;
  summary: string;
  relevance: number;
  key_holdings: string[];
  legal_basis: string[];
}

export function TaxPrecedentSearchPanel({ initialQuery = "" }: TaxPrecedentSearchPanelProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Precedent[]>([]);

  async function search() {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.tax.precedentSearch({ query: query.trim() });
      setResults(res.precedents);
      if (res.precedents.length === 0) {
        addToast({ type: "info", title: t("tax.precedent.empty") });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.precedent.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
          <Scale size={16} className="text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("tax.precedent.title")}
          </h3>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("tax.precedent.desc")}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder={t("tax.precedent.placeholder")}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => void search()}
          disabled={loading || query.trim().length < 2}
          className="gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? t("tax.precedent.searching") : t("tax.precedent.search")}
        </Button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-600">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!loading && !error && results.length === 0 && query && (
        <p className="mt-4 py-4 text-center text-sm text-[color:var(--ds-text-subtle)]">
          {t("tax.precedent.empty")}
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((p, i) => (
            <div
              key={i}
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Gavel size={13} className="text-[color:var(--ds-text-subtle)]" />
                    <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {p.court}
                    </span>
                  </div>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    {p.file_number} · {p.date}
                  </span>
                </div>
                <Badge variant="accent" className="shrink-0">
                  {Math.round(p.relevance * 100)}%
                </Badge>
              </div>

              <p className="text-sm text-[color:var(--ds-text)]">{p.summary}</p>

              {p.key_holdings.length > 0 && (
                <div className="mt-2">
                  <p className="mb-0.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {t("tax.precedent.key_holdings")}
                  </p>
                  <ul className="space-y-0.5">
                    {p.key_holdings.map((h, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-1.5 text-xs text-[color:var(--ds-text-subtle)]"
                      >
                        <span className="brand-text mt-0.5">▸</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {p.legal_basis.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.legal_basis.map((b, j) => (
                    <Badge key={j} variant="default" className="text-[10px]">
                      {b}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
