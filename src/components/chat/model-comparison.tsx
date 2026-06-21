"use client";

import { useState, useCallback, useRef } from "react";
import { GitCompare, Loader2, X, Cpu, Zap, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { AI_MODELS, formatCost } from "@/lib/model-config";
import { ModelSelector } from "@/components/dashboard/model-selector";
import type { QueryResponse } from "@/lib/types";

interface ModelResult {
  modelId: string;
  modelName: string;
  answer: string;
  tokensUsed?: number;
  latencyMs?: number;
  citations?: Array<{ slug: string; title: string }>;
  loading: boolean;
  error?: string;
}

export function ModelComparison() {
  const [query, setQuery] = useState("");
  const [modelA, setModelA] = useState<string | undefined>(undefined);
  const [modelB, setModelB] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runComparison = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !modelA || !modelB) return;

    setHasRun(true);
    setResults([
      {
        modelId: modelA,
        modelName: AI_MODELS.find((m) => m.id === modelA)?.name ?? modelA,
        answer: "",
        loading: true,
      },
      {
        modelId: modelB,
        modelName: AI_MODELS.find((m) => m.id === modelB)?.name ?? modelB,
        answer: "",
        loading: true,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    for (let i = 0; i < 2; i++) {
      const modelId = i === 0 ? modelA : modelB;
      const modelName = AI_MODELS.find((m) => m.id === modelId)?.name ?? modelId;

      setResults((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], loading: true };
        return next;
      });

      try {
        const result: QueryResponse = await api.query.think(trimmed, {
          mode: "balanced",
          model: modelId,
          signal: controller.signal,
        });

        setResults((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            answer: result.answer,
            tokensUsed: result.tokens_used,
            latencyMs: result.latency_ms,
            citations: result.citations,
            loading: false,
          };
          return next;
        });
      } catch (err) {
        const isAborted = err instanceof DOMException && err.name === "AbortError";
        setResults((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            loading: false,
            answer: isAborted ? "[Abgebrochen]" : "",
            error: isAborted
              ? undefined
              : err instanceof Error
                ? err.message
                : "Unbekannter Fehler",
          };
          return next;
        });
      }
    }
  }, [query, modelA, modelB]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <GitCompare size={20} className="brand-text" />
          <h1 className="text-xl font-bold text-[color:var(--ds-text)]">Modell-Vergleich</h1>
        </div>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
          Vergleiche Antworten verschiedener KI-Modelle auf dieselbe Frage side-by-side.
        </p>
      </div>

      {/* Query input + model selectors */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
            Frage
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="z.B. Was ist die Verjährungsfrist für Ansprüche aus unerlaubter Handung?"
            rows={3}
            className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Modell A
            </label>
            <ModelSelector selectedModelId={modelA} onSelect={setModelA} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Modell B
            </label>
            <ModelSelector selectedModelId={modelB} onSelect={setModelB} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-[color:var(--ds-text-subtle)]">
            {modelA && modelB && (
              <span>
                Geschätzte Kosten:{" "}
                {formatCost(
                  ((AI_MODELS.find((m) => m.id === modelA)?.costPer1MInput ?? 0) +
                    (AI_MODELS.find((m) => m.id === modelB)?.costPer1MInput ?? 0)) /
                    2
                )}{" "}
                / 1M Tokens
              </span>
            )}
          </div>
          <button
            onClick={runComparison}
            disabled={!query.trim() || !modelA || !modelB || results.some((r) => r.loading)}
            className="brand-bg brand-text-on-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {results.some((r) => r.loading) ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <GitCompare size={14} />
            )}
            Vergleichen
          </button>
        </div>
      </div>

      {/* Results side-by-side */}
      {hasRun && results.length === 2 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {results.map((result, idx) => {
            const model = AI_MODELS.find((m) => m.id === result.modelId);
            return (
              <div
                key={idx}
                className="flex flex-col rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Cpu size={14} className="text-[color:var(--ds-text-muted)]" />
                    <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {result.modelName}
                    </span>
                  </div>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    {String.fromCharCode(65 + idx)}
                  </span>
                </div>

                {/* Model meta */}
                {model && (
                  <div className="flex items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-2 text-xs text-[color:var(--ds-text-subtle)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={10} />
                      {model.contextWindow.toLocaleString("de-DE")} ctx
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Zap size={10} />
                      Speed: {model.speedRating}/5
                    </span>
                    <span>
                      ${model.costPer1MInput.toFixed(1)}/${model.costPer1MOutput.toFixed(1)}/1M
                    </span>
                  </div>
                )}

                {/* Answer */}
                <div className="flex-1 overflow-y-auto p-4">
                  {result.loading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-3.5 animate-pulse rounded bg-[color:var(--ds-surface-2)]"
                          style={{
                            width: `${Math.max(40, 100 - i * 12)}%`,
                            animationDelay: `${i * 100}ms`,
                          }}
                        />
                      ))}
                    </div>
                  ) : result.error ? (
                    <div className="text-sm text-red-600 dark:text-red-400">{result.error}</div>
                  ) : (
                    <div className="prose-chat text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                      {result.answer}
                    </div>
                  )}
                </div>

                {/* Footer with metrics */}
                {!result.loading && !result.error && (
                  <div className="flex items-center gap-3 border-t border-[color:var(--ds-border)] px-4 py-2 text-xs text-[color:var(--ds-text-subtle)]">
                    {result.tokensUsed != null && (
                      <span className="inline-flex items-center gap-1">
                        <Zap size={10} />
                        {result.tokensUsed.toLocaleString("de-DE")} Tokens
                      </span>
                    )}
                    {result.latencyMs != null && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} />
                        {(result.latencyMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    {result.citations && result.citations.length > 0 && (
                      <span>{result.citations.length} Quellen</span>
                    )}
                    {result.tokensUsed != null && model && (
                      <span className="ml-auto font-medium">
                        ~
                        {formatCost(
                          (result.tokensUsed / 1_000_000) *
                            (model.costPer1MInput + model.costPer1MOutput)
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Winner indicator */}
      {hasRun &&
        results.length === 2 &&
        !results.some((r) => r.loading) &&
        !results.some((r) => r.error) && (
          <div className="flex items-center justify-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-3 text-sm">
            {results[0].latencyMs != null && results[1].latencyMs != null && (
              <span className="text-[color:var(--ds-text-muted)]">
                Schneller:{" "}
                <strong className="text-[color:var(--ds-text)]">
                  {results[0].latencyMs < results[1].latencyMs
                    ? results[0].modelName
                    : results[1].modelName}
                </strong>{" "}
                ({Math.min(results[0].latencyMs, results[1].latencyMs) / 1000}s)
              </span>
            )}
            {results[0].tokensUsed != null && results[1].tokensUsed != null && (
              <>
                <ArrowRight size={12} className="text-[color:var(--ds-text-subtle)]" />
                <span className="text-[color:var(--ds-text-muted)]">
                  Token-effizienter:{" "}
                  <strong className="text-[color:var(--ds-text)]">
                    {results[0].tokensUsed < results[1].tokensUsed
                      ? results[0].modelName
                      : results[1].modelName}
                  </strong>{" "}
                  ({Math.min(results[0].tokensUsed, results[1].tokensUsed).toLocaleString("de-DE")}{" "}
                  Tokens)
                </span>
              </>
            )}
          </div>
        )}
    </div>
  );
}
