"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import {
  Scale,
  Loader2,
  AlertTriangle,
  Search,
  ChevronDown,
  Calendar,
  BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BfhFeedResult {
  decisions: Array<{
    court: string;
    file_number: string;
    date: string;
    topic: string;
    summary: string;
    key_holdings: string[];
    legal_basis: string[];
    relevance: "high" | "medium" | "low";
  }>;
  topic_summary: string;
  generatedAt: string;
}

const RELEVANCE_COLORS: Record<string, string> = {
  high: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  low: "text-[color:var(--ds-text-muted)] bg-[color:var(--ds-surface-2)] border-[color:var(--ds-border)]",
};

export function TaxBfhFeedPanel() {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BfhFeedResult | null>(null);
  const [topic, setTopic] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  async function loadFeed() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tax.bfhFeed({
        topic: topic.trim() || undefined,
        limit: 10,
      });
      setResult(res);
      addToast({ type: "success", title: t("tax.bfh_feed.title") });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tax.bfh_feed.error"));
    } finally {
      setLoading(false);
    }
  }

  const locale = lang === "en" ? "en-GB" : "de-DE";

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
            <Scale size={16} className="brand-text" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("tax.bfh_feed.title")}
            </h3>
            <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("tax.bfh_feed.desc")}</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4 flex gap-2">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t("tax.bfh_feed.topic_placeholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") void loadFeed();
          }}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={() => void loadFeed()}
          disabled={loading}
          className="brand-bg gap-2 text-white"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? t("tax.bfh_feed.loading") : t("tax.bfh_feed.search")}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-600">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!result && !error && !loading && (
        <p className="py-6 text-center text-sm text-[color:var(--ds-text-subtle)]">
          {t("tax.bfh_feed.empty")}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Topic summary */}
          {result.topic_summary && (
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                <BookMarked size={12} /> {t("tax.bfh_feed.overview")}
              </p>
              <p className="text-sm text-[color:var(--ds-text)]">{result.topic_summary}</p>
            </div>
          )}

          {/* Decisions list */}
          {result.decisions.length === 0 ? (
            <p className="py-4 text-center text-sm text-[color:var(--ds-text-subtle)]">
              {t("tax.bfh_feed.no_results")}
            </p>
          ) : (
            <div className="space-y-2">
              {result.decisions.map((d, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                >
                  <button
                    onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[color:var(--ds-surface-2)]/50"
                    aria-expanded={expandedIdx === i}
                  >
                    <ChevronDown
                      size={14}
                      className={cn(
                        "shrink-0 text-[color:var(--ds-text-muted)] transition-transform",
                        expandedIdx === i && "rotate-180"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">
                          {d.court} {d.file_number}
                        </span>
                        <Badge
                          variant="default"
                          className={cn("border", RELEVANCE_COLORS[d.relevance])}
                        >
                          {d.relevance}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
                        {d.topic}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                      <Calendar size={11} />
                      {d.date
                        ? new Date(d.date).toLocaleDateString(locale, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </div>
                  </button>

                  {expandedIdx === i && (
                    <div className="space-y-3 border-t border-[color:var(--ds-border)] p-3">
                      <p className="text-sm text-[color:var(--ds-text)]">{d.summary}</p>

                      {d.key_holdings.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
                            {t("tax.bfh_feed.holdings")}
                          </p>
                          <ul className="space-y-1">
                            {d.key_holdings.map((h, j) => (
                              <li
                                key={j}
                                className="flex items-start gap-2 text-xs text-[color:var(--ds-text)]"
                              >
                                <span className="brand-text mt-0.5">▸</span>
                                {h}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {d.legal_basis.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                            {t("tax.bfh_feed.legal_basis")}:
                          </span>
                          {d.legal_basis.map((b, j) => (
                            <Badge key={j} variant="default" className="font-mono text-xs">
                              {b}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
