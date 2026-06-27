/**
 * Gap 19: Mobile Pipeline Status — responsive Pipeline-Übersicht.
 *
 * Harvey-Feature: Mobile App mit Zugriff auf alle Features.
 *
 * Subsumio-Status vor Gap 19: Mobile Dashboard existiert (Capacitor),
 * aber keine Pipeline-Status-Seite und kein Output-Viewer für mobile.
 *
 * Diese Seite zeigt:
 * - Alle Pipeline-Runs mit Status (running, completed, failed, awaiting_review)
 * - Tap-to-expand für Layer-Details
 * - Resume-Button für awaiting_review
 * - Output-Viewer mit Markdown-Rendering
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  Download,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";

interface PipelineLayerState {
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output_slugs?: string[];
  error?: string;
}

interface PipelineStateResponse {
  case_slug: string;
  status: "running" | "completed" | "failed" | "awaiting_review" | "paused";
  current_layer: number;
  layers: Record<number, PipelineLayerState>;
  total_duration_ms?: number;
  cost_spent_usd?: number;
  review_entities?: unknown;
  updated_at: string;
}

const STATUS_ICONS: Record<string, typeof Clock> = {
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  awaiting_review: AlertCircle,
  paused: Clock,
};

const STATUS_COLORS: Record<string, string> = {
  running: "text-blue-500",
  completed: "text-green-500",
  failed: "text-red-500",
  awaiting_review: "text-yellow-500",
  paused: "text-gray-500",
};

const LAYER_NAMES: Record<number, string> = {
  1: "ON-Scanner",
  2: "Entity-Extractor",
  3: "Forensic Analyst",
  4: "Damage + Deadlines",
  5: "Legal Drafter",
  6: "Legal Critic",
};

export default function MobilePipelinePage() {
  const { t: _t } = useLang();
  const [pipelines, setPipelines] = useState<PipelineStateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [outputView, setOutputView] = useState<{ slug: string; content: string } | null>(null);
  const [outputLoading, setOutputLoading] = useState(false);

  const loadPipelines = useCallback(async () => {
    try {
      const res = await csrfFetch("/api/pipeline/list", {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data.pipelines ?? []);
      }
    } catch (err) {
      console.error("Failed to load pipelines:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipelines();
    // Auto-refresh every 5s for running pipelines
    const interval = setInterval(() => {
      if (pipelines.some((p) => p.status === "running")) {
        loadPipelines();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loadPipelines, pipelines]);

  const viewOutput = useCallback(async (slug: string) => {
    setOutputLoading(true);
    setOutputView(null);
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const page = await res.json();
        setOutputView({ slug, content: String(page.compiled_truth ?? page.content ?? "") });
      }
    } catch (err) {
      console.error("Failed to load output:", err);
    } finally {
      setOutputLoading(false);
    }
  }, []);

  const resumePipeline = useCallback(
    async (caseSlug: string) => {
      try {
        const res = await csrfFetch("/api/pipeline/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case_slug: caseSlug, resume_from_layer: 3 }),
        });
        if (res.ok) {
          loadPipelines();
        }
      } catch (err) {
        console.error("Failed to resume pipeline:", err);
      }
    },
    [loadPipelines]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--ds-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Output viewer overlay
  if (outputView) {
    return (
      <div className="min-h-screen bg-[color:var(--ds-bg)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setOutputView(null)} className="text-sm text-blue-500">
            ← Zurück
          </button>
          <a
            href={`/api/word-export?slug=${encodeURIComponent(outputView.slug)}`}
            className="inline-flex items-center gap-1 text-sm text-blue-500"
          >
            <Download size={14} /> Word
          </a>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <pre className="text-xs whitespace-pre-wrap text-[color:var(--ds-text)]">
            {outputView.content}
          </pre>
        </div>
      </div>
    );
  }

  if (outputLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--ds-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--ds-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
        <h1 className="text-lg font-semibold text-[color:var(--ds-text)]">Pipeline</h1>
        <p className="text-xs text-[color:var(--ds-text-muted)]">{pipelines.length} Fälle</p>
      </div>

      {/* Pipeline List */}
      <div className="divide-y divide-[color:var(--ds-border)]">
        {pipelines.length === 0 && (
          <div className="p-8 text-center text-sm text-[color:var(--ds-text-muted)]">
            Keine Pipeline-Runs gefunden
          </div>
        )}
        {pipelines.map((pipeline) => {
          const isExpanded = expandedPipeline === pipeline.case_slug;
          const StatusIcon = STATUS_ICONS[pipeline.status] ?? Clock;
          const statusColor = STATUS_COLORS[pipeline.status] ?? "text-gray-500";

          return (
            <div key={pipeline.case_slug} className="px-4 py-3">
              {/* Pipeline Header */}
              <button
                onClick={() => setExpandedPipeline(isExpanded ? null : pipeline.case_slug)}
                className="flex w-full items-center gap-3 text-left"
              >
                {isExpanded ? (
                  <ChevronDown size={18} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                ) : (
                  <ChevronRight size={18} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                )}
                <StatusIcon
                  size={18}
                  className={`shrink-0 ${statusColor} ${pipeline.status === "running" ? "animate-spin" : ""}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {pipeline.case_slug}
                  </p>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    Layer {pipeline.current_layer}/6 · {pipeline.status}
                  </p>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 space-y-2">
                  {/* Cost + Duration */}
                  <div className="flex gap-4 text-xs text-[color:var(--ds-text-muted)]">
                    {pipeline.total_duration_ms && (
                      <span>⏱ {(pipeline.total_duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    {pipeline.cost_spent_usd != null && (
                      <span>💰 ${pipeline.cost_spent_usd.toFixed(2)}</span>
                    )}
                  </div>

                  {/* Layer Status */}
                  <div className="space-y-1">
                    {Object.entries(pipeline.layers)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([layerNum, layerState]) => {
                        const num = Number(layerNum);
                        const LayerIcon = STATUS_ICONS[layerState.status] ?? Clock;
                        const layerColor = STATUS_COLORS[layerState.status] ?? "text-gray-500";
                        const layerKey = `${pipeline.case_slug}:${layerNum}`;
                        const isLayerExpanded = expandedLayer === layerKey;

                        return (
                          <div key={layerNum}>
                            <button
                              onClick={() => setExpandedLayer(isLayerExpanded ? null : layerKey)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[color:var(--ds-surface-hover)]"
                            >
                              <LayerIcon
                                size={14}
                                className={`shrink-0 ${layerColor} ${layerState.status === "running" ? "animate-spin" : ""}`}
                              />
                              <span className="text-xs font-medium text-[color:var(--ds-text)]">
                                {LAYER_NAMES[num] ?? `Layer ${num}`}
                              </span>
                              <span className="ml-auto text-xs text-[color:var(--ds-text-muted)]">
                                {layerState.status}
                              </span>
                            </button>

                            {/* Layer Outputs */}
                            {isLayerExpanded &&
                              layerState.output_slugs &&
                              layerState.output_slugs.length > 0 && (
                                <div className="mt-1 ml-6 space-y-1">
                                  {layerState.output_slugs.map((slug) => (
                                    <button
                                      key={slug}
                                      onClick={() => viewOutput(slug)}
                                      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-blue-500 hover:bg-[color:var(--ds-surface-hover)]"
                                    >
                                      <FileText size={12} className="shrink-0" />
                                      <span className="truncate">{slug}</span>
                                    </button>
                                  ))}
                                </div>
                              )}

                            {/* Layer Error */}
                            {isLayerExpanded && layerState.error && (
                              <div className="mt-1 ml-6 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
                                {layerState.error}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* Resume Button for awaiting_review */}
                  {pipeline.status === "awaiting_review" && (
                    <button
                      onClick={() => resumePipeline(pipeline.case_slug)}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                    >
                      <Play size={14} /> Pipeline fortsetzen
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
