"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  Globe,
} from "lucide-react";

interface FreshnessSource {
  source_id: string;
  status: string;
  last_sync: string | null;
  doc_count: number;
}

interface FreshnessResponse {
  freshness: Record<string, unknown> | null;
  sources: FreshnessSource[];
  last_updated: string;
}

const JURISDICTION_LABELS: Record<string, string> = {
  "law-de": "Deutschland",
  "law-at": "Österreich",
  "law-ch": "Schweiz",
  "law-eu": "EU",
  "law-at-judikatur": "AT Judikatur",
};

const STATUS_CONFIG: Record<string, { variant: "success" | "warning" | "danger" | "default"; icon: typeof CheckCircle2 }> = {
  fresh: { variant: "success", icon: CheckCircle2 },
  stale: { variant: "warning", icon: AlertTriangle },
  error: { variant: "danger", icon: XCircle },
  unknown: { variant: "default", icon: Clock },
};

export function CorpusFreshnessWidget() {
  const { data, isLoading } = useQuery<FreshnessResponse>({
    queryKey: ["corpus-freshness"],
    queryFn: async () => {
      const res = await fetch("/api/monitoring/corpus-freshness");
      if (!res.ok) throw new Error("Failed to fetch freshness data");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Corpus Freshness
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3" aria-busy="true" aria-label="Corpus Freshness wird geladen">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sources = data?.sources ?? [];
  const freshCount = sources.filter((s) => s.status === "fresh").length;
  const staleCount = sources.filter((s) => s.status === "stale").length;
  const errorCount = sources.filter((s) => s.status === "error").length;
  const totalDocs = sources.reduce((sum, s) => sum + (s.doc_count ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Corpus Freshness
          </span>
          <Badge variant={staleCount > 0 || errorCount > 0 ? "warning" : "success"} className="text-xs">
            {freshCount}/{sources.length} fresh
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-[color:var(--ds-success-text)]">{freshCount}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Fresh</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[color:var(--ds-warning-text)]">{staleCount}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Stale</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[color:var(--ds-danger-text)]">{errorCount}</div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Error</div>
          </div>
        </div>

        {/* Total documents */}
        <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)] pt-1 border-t">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Total documents
          </span>
          <span className="font-medium">{totalDocs.toLocaleString()}</span>
        </div>

        {/* Per-source status */}
        <div className="space-y-1.5">
          {sources.map((source) => {
            const config = STATUS_CONFIG[source.status] ?? STATUS_CONFIG.unknown;
            const Icon = config.icon;
            const label = JURISDICTION_LABELS[source.source_id] ?? source.source_id;
            return (
              <div key={source.source_id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3" />
                  {label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[color:var(--ds-text-muted)]">{source.doc_count} docs</span>
                  <Badge variant={config.variant} className="text-xs">
                    {source.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* Last updated */}
        {data?.last_updated && (
          <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)] pt-1 border-t">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last check
            </span>
            <span>
              {new Date(data.last_updated).toLocaleString("de-DE", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
