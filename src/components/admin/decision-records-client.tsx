"use client";

/**
 * Decision Records Client — Audit-View für Agent-Entscheidungen.
 *
 * Zeigt pro Case/Job:
 *   - Specialist, Layer, Model, Tier
 *   - Tool-Calls mit Rationale (EBTE)
 *   - Token-Verbrauch, Dauer
 *   - Final Output Summary
 *
 * Wie OpenAI's Run Details View mit Tool-Call-Trace.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  Wrench,
  Clock,
  Coins,
  ChevronDown,
  ChevronRight,
  FileText,
  Cpu,
  Activity,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, ApiGetError } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

interface ToolCall {
  tool: string;
  input_summary: string;
  rationale?: string;
  timestamp: string;
}

interface DecisionRecord {
  id: number;
  jobId: number;
  specialist: string;
  layer: number;
  layerName?: string;
  caseSlug?: string;
  model: string;
  modelTier: string;
  queryOrTask?: string;
  toolsCalled: ToolCall[];
  alternativesConsidered?: string[];
  selectedApproach?: string;
  confidence?: string;
  reasoningSummary?: string;
  finalOutputSummary?: string;
  tokensIn: number;
  tokensOut: number;
  tokensCacheRead: number;
  durationMs: number;
  /** v0.43.x EBTE Soft-Enforcement: compliance metrics */
  ebteTotalToolCalls?: number;
  ebteMissingRationales?: number;
  ebteComplianceRate?: number;
  createdAt: string;
}

const TIER_COLORS: Record<string, string> = {
  utility: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  reasoning: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  deep: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  subagent: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatTokens(n: number): string {
  if (n === 0) return "—";
  if (n < 1000) return `${n}`;
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1000000).toFixed(2)}M`;
}

/** v0.43.x EBTE Compliance Badge — zeigt ob Tool-Calls rationale-Blöcke hatten.
 *  Grün ≥80%, Gelb 50-79%, Rot <50%. Wie OpenAI's "tool call compliance" Metrik. */
function EBTEComplianceBadge({
  rate,
  total,
  missing,
}: {
  rate: number;
  total: number;
  missing: number;
}) {
  const pct = Math.round(rate * 100);
  const variant = pct >= 80 ? "success" : pct >= 50 ? "warning" : "danger";
  return (
    <Badge
      variant={variant}
      className="shrink-0 font-mono text-xs"
      title={`EBTE Compliance: ${pct}% (${total - missing}/${total} tool calls hatten rationale blocks)`}
    >
      EBTE {pct}%
    </Badge>
  );
}

function RecordRow({ record }: { record: DecisionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const modelShort = record.model.replace(/^(anthropic|openrouter|xai):/, "");

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-4 text-left transition-[background-color] duration-200 hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
        aria-expanded={expanded}
        aria-label={`Decision record for ${record.specialist}`}
      >
        {expanded ? (
          <ChevronDown
            size={16}
            className="shrink-0 text-[color:var(--ds-text-muted)]"
            aria-hidden
          />
        ) : (
          <ChevronRight
            size={16}
            className="shrink-0 text-[color:var(--ds-text-muted)]"
            aria-hidden
          />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="default" className={cn("text-xs", TIER_COLORS[record.modelTier] ?? "")}>
              {record.modelTier}
            </Badge>
            <span className="font-mono text-xs font-medium text-[color:var(--ds-text)]">
              L{record.layer}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Brain size={14} className="brand-text shrink-0" aria-hidden />
              <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                {record.specialist}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
              <span className="font-mono">{modelShort}</span>
              <span className="flex items-center gap-0.5">
                <Wrench size={11} aria-hidden /> {record.toolsCalled.length}
              </span>
              <span className="flex items-center gap-0.5">
                <Clock size={11} aria-hidden /> {formatDuration(record.durationMs)}
              </span>
              <span className="flex items-center gap-0.5">
                <Coins size={11} aria-hidden /> {formatTokens(record.tokensIn + record.tokensOut)}
              </span>
            </div>
          </div>
        </div>
        {/* v0.43.x EBTE Compliance Badge — grün/gelb/rot */}
        {record.ebteTotalToolCalls != null && record.ebteTotalToolCalls > 0 && (
          <EBTEComplianceBadge
            rate={record.ebteComplianceRate ?? 1}
            total={record.ebteTotalToolCalls}
            missing={record.ebteMissingRationales ?? 0}
          />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-[color:var(--ds-border)] p-4">
          {/* Query/Task */}
          {record.queryOrTask && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                <Search size={12} aria-hidden /> Query / Task
              </h4>
              <p className="rounded-md bg-[color:var(--ds-hover)] p-3 text-xs text-[color:var(--ds-text)]">
                {record.queryOrTask}
              </p>
            </div>
          )}

          {/* Tool Calls with Rationale (EBTE) */}
          {record.toolsCalled.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                <Wrench size={12} aria-hidden /> Tool Calls ({record.toolsCalled.length})
              </h4>
              <div className="space-y-2">
                {record.toolsCalled.map((tc, i) => (
                  <div key={i} className="rounded-md border border-[color:var(--ds-border)] p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="info" className="font-mono text-xs">
                        {tc.tool}
                      </Badge>
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        {new Date(tc.timestamp).toLocaleTimeString("de-AT")}
                      </span>
                    </div>
                    {tc.rationale && (
                      <p className="mt-2 text-xs text-[color:var(--ds-text-muted)] italic">
                        <span className="font-semibold not-italic">Rationale:</span> {tc.rationale}
                      </p>
                    )}
                    <p className="mt-1.5 font-mono text-xs text-[color:var(--ds-text)]">
                      {tc.input_summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Output Summary */}
          {record.finalOutputSummary && (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                <FileText size={12} aria-hidden /> Output Summary
              </h4>
              <p className="rounded-md bg-[color:var(--ds-hover)] p-3 text-xs text-[color:var(--ds-text)]">
                {record.finalOutputSummary}
              </p>
            </div>
          )}

          {/* Token Details */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-[color:var(--ds-border)] p-3 text-center">
              <div className="text-xs text-[color:var(--ds-text-muted)]">Input</div>
              <div className="font-mono text-sm font-medium text-[color:var(--ds-text)]">
                {formatTokens(record.tokensIn)}
              </div>
            </div>
            <div className="rounded-md border border-[color:var(--ds-border)] p-3 text-center">
              <div className="text-xs text-[color:var(--ds-text-muted)]">Output</div>
              <div className="font-mono text-sm font-medium text-[color:var(--ds-text)]">
                {formatTokens(record.tokensOut)}
              </div>
            </div>
            <div className="rounded-md border border-[color:var(--ds-border)] p-3 text-center">
              <div className="text-xs text-[color:var(--ds-text-muted)]">Cache Read</div>
              <div className="font-mono text-sm font-medium text-[color:var(--ds-text)]">
                {formatTokens(record.tokensCacheRead)}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function DecisionRecordsClient() {
  const [search, setSearch] = useState("");
  const { t } = useLang();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-decision-records", search],
    queryFn: () => {
      if (!search) return { records: [] as DecisionRecord[] };
      const params = search.match(/^\d+$/)
        ? `?job_id=${search}`
        : `?case_slug=${encodeURIComponent(search)}`;
      return apiGet<{ ok: boolean; records: DecisionRecord[] }>(
        `/api/admin/decision-records${params}`
      );
    },
    enabled: search.length > 0,
    retry: false,
  });

  const records = data?.records ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Activity size={20} className="brand-text" aria-hidden />
        <h1 className="text-lg font-semibold text-[color:var(--ds-text)]">
          {t("decision_records.title")}
        </h1>
        <Badge variant="info" className="text-xs">
          TRACE / EBTE
        </Badge>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          type="search"
          placeholder={t("decision_records.search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
          aria-label={t("decision_records.search_placeholder")}
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[color:var(--ds-hover)]" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && error instanceof ApiGetError && (
        <Card className="border-red-200 p-4 dark:border-red-900">
          <p className="text-sm text-red-600 dark:text-red-400">
            {t("decision_records.error_loading")} {error.message}
          </p>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && search.length > 0 && records.length === 0 && (
        <Card className="p-8 text-center">
          <Cpu size={32} className="mx-auto mb-3 text-[color:var(--ds-text-muted)]" aria-hidden />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {t("decision_records.empty")}: &ldquo;{search}&rdquo;
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
            Records werden beim Durchlaufen der Pipeline automatisch erstellt.
          </p>
        </Card>
      )}

      {/* Initial State */}
      {!isLoading && search.length === 0 && (
        <Card className="p-8 text-center">
          <Search
            size={32}
            className="mx-auto mb-3 text-[color:var(--ds-text-muted)]"
            aria-hidden
          />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {t("decision_records.initial")}
          </p>
        </Card>
      )}

      {/* Records */}
      {records.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {records.length} Record{records.length !== 1 ? "s" : ""}{" "}
              {t("decision_records.records_found")}
            </p>
          </div>
          {records.map((record) => (
            <RecordRow key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}
