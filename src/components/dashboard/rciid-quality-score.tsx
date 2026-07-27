"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gauge, AlertCircle, Lightbulb, RefreshCw, Loader2, ArrowUpCircle, X } from "lucide-react";
import { getQualityColor, getQualityLabel } from "@/lib/rciid-client";

interface RciidQualityScoreProps {
  rciidCaseId: string;
  onImproveData?: (missingData: string[]) => void;
}

export function RciidQualityScore({ rciidCaseId, onImproveData }: RciidQualityScoreProps) {
  const [score, setScore] = useState<number | null>(null);
  const [missingData, setMissingData] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [automatablePct, setAutomatablePct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const loadFeedback = useCallback(async () => {
    try {
      const res = await api.rciid.getFeedback(rciidCaseId);
      if (res.score !== null && res.score !== undefined) {
        setScore(res.score);
        setMissingData(res.missingData ?? []);
        setSuggestions(res.suggestions ?? []);
        setAutomatablePct(res.automatablePercentage ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback konnte nicht geladen werden.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rciidCaseId]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    await loadFeedback();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
        <Loader2 size={14} className="animate-spin text-[color:var(--ds-text-muted)]" />
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          Datenqualität wird geladen...
        </span>
      </div>
    );
  }

  if (dismissed || score === null) return null;

  const color = getQualityColor(score);
  const isLowScore = score <= 2;

  return (
    <div
      className="space-y-3 rounded-lg border px-4 py-3"
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}10`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge size={16} style={{ color }} />
          <span className="text-sm font-medium text-[color:var(--ds-text)]">
            Datenqualitäts-Score
          </span>
          <Badge
            variant="default"
            className="text-xs"
            style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
          >
            {score}/5
          </Badge>
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {automatablePct}% automatisierbar
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-7 w-7 p-0"
          >
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="h-7 w-7 p-0"
          >
            <X size={12} />
          </Button>
        </div>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            className="h-2 flex-1 rounded-full"
            style={{
              backgroundColor: s <= score ? color : "var(--ds-hover)",
            }}
          />
        ))}
      </div>

      {/* Score label */}
      <p className="text-xs" style={{ color }}>
        {getQualityLabel(score)}
      </p>

      {/* Missing Data */}
      {missingData.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs font-medium text-[color:var(--ds-text)]">
            <AlertCircle size={12} className="text-[color:var(--ds-warning-text)]" />
            Fehlende Daten:
          </div>
          <ul className="ml-4 list-disc space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
            {missingData.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs font-medium text-[color:var(--ds-text)]">
            <Lightbulb size={12} className="text-[color:var(--ds-warning-text)]" />
            Empfehlungen:
          </div>
          <ul className="ml-4 list-disc space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
            {suggestions.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Button */}
      {isLowScore && onImproveData && missingData.length > 0 && (
        <Button size="sm" onClick={() => onImproveData(missingData)} className="w-full">
          <ArrowUpCircle size={14} className="mr-2" />
          Daten ergänzen ({missingData.length} Felder)
        </Button>
      )}

      {error && <p className="text-xs text-[color:var(--ds-danger-text)]">{error}</p>}
    </div>
  );
}
