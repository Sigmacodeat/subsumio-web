"use client";

import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Zap,
  Ruler,
  Layers,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────────────

interface RoleBucket {
  role: string;
  count: number;
}
interface LengthBucket {
  bucket: string;
  label: string;
  count: number;
}
interface SourceRow {
  source: string;
  pages: number;
  chunks: number;
  embedded: number;
  coveragePct: number;
  avgLength: number;
}
interface QualityData {
  totalChunks: number;
  embeddedChunks: number;
  embeddingCoveragePct: number;
  avgLength: number;
  roleDistribution: RoleBucket[];
  lengthHistogram: LengthBucket[];
  perSource: SourceRow[];
  generatedAt: string;
}

const API_BASE = "/api/admin/chunk-quality";

const fmt = (n: number) => n.toLocaleString("de-DE");
const pct = (n: number) => `${n.toFixed(1)}%`;

const ROLE_COLORS_MAP: Record<string, string> = {
  leitsatz: "var(--ds-success-text)",
  entscheidungsgruende: "var(--ds-info-text)",
  tenor: "var(--ds-attention-text)",
  sachverhalt: "var(--ds-category-violet-text)",
  metadata: "var(--ds-text-muted)",
  full: "var(--ds-category-teal-text)",
  entscheidungstext: "var(--ds-warning-text)",
  absatz: "var(--ds-info-text)",
  remainder: "var(--ds-danger-text)",
  "(leer)": "var(--ds-text-subtle)",
};

const LENGTH_COLORS: Record<string, string> = {
  tiny: "var(--ds-danger-solid)",
  small: "var(--ds-warning-solid)",
  medium: "var(--ds-attention-solid)",
  optimal: "var(--ds-success-solid)",
  large: "var(--ds-info-solid)",
  oversized: "var(--ds-category-violet-text)",
};

// ── Component ────────────────────────────────────────────────────────────

export function ChunkQuality({ liveEmbedding = false, onSelectSource }: { liveEmbedding?: boolean; onSelectSource?: (sourceId: string) => void }) {
  const qualityQuery = useQuery<{ data: QualityData }>({
    queryKey: ["chunk-quality"],
    queryFn: () =>
      fetch(API_BASE, { credentials: "same-origin" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ data: QualityData }>;
      }),
    staleTime: 10_000,
    // Live-Embedding-Progress: refetch alle 5s wenn Embeddings laufen
    refetchInterval: () => {
      if (!liveEmbedding) return false;
      const data = qualityQuery.data?.data;
      if (!data || data.embeddingCoveragePct >= 100) return false;
      return 5_000;
    },
  });

  if (qualityQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="mt-2 h-6 w-20" />
                <Skeleton className="mt-1 h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="mt-4 h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="mt-4 h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (qualityQuery.isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            Fehler beim Laden der Chunk-Qualität.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => qualityQuery.refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Neu laden
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = qualityQuery.data?.data;
  if (!data) return null;

  const isLive = liveEmbedding && data.embeddingCoveragePct < 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive && (
            <Badge className="bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] animate-pulse">
              <TrendingUp className="mr-1 h-3 w-3" />
              Live
            </Badge>
          )}
          <span className="text-xs text-[color:var(--ds-text-subtle)]">
            Aktualisiert: {new Date(data.generatedAt).toLocaleTimeString("de-AT")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qualityQuery.refetch()}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${qualityQuery.isFetching ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Database className="h-8 w-8 text-[color:var(--ds-info-text)]" />
            <div>
              <p className="text-2xl font-bold tabular-nums">{fmt(data.totalChunks)}</p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Total Chunks</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-8 w-8 text-[color:var(--ds-success-text)]" />
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold tabular-nums">{fmt(data.embeddedChunks)}</p>
              <div className="mt-1 flex items-center gap-2">
                <Progress value={data.embeddingCoveragePct} className="h-2 w-20" />
                <span className="text-xs tabular-nums text-[color:var(--ds-text-subtle)]">
                  {pct(data.embeddingCoveragePct)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Ruler className="h-8 w-8 text-[color:var(--ds-category-violet-text)]" />
            <div>
              <p className="text-2xl font-bold tabular-nums">{fmt(data.avgLength)}</p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Ø Länge (chars)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Layers className="h-8 w-8 text-[color:var(--ds-attention-text)]" />
            <div>
              <p className="text-2xl font-bold tabular-nums">{data.roleDistribution.length}</p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Rollen</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Role Distribution Pie */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="mb-4 text-sm font-medium">Rollen-Verteilung</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.roleDistribution}
                  dataKey="count"
                  nameKey="role"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                >
                  {data.roleDistribution.map((entry: RoleBucket) => (
                    <Cell
                      key={entry.role}
                      fill={ROLE_COLORS_MAP[entry.role] ?? "var(--ds-text-subtle)"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${fmt(value)} (${pct((value / data.totalChunks) * 100)})`,
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: "var(--ds-surface)",
                    border: "1px solid var(--ds-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                  formatter={(value: string) => {
                    const entry = data.roleDistribution.find((r: RoleBucket) => r.role === value);
                    return `${value} (${entry ? fmt(entry.count) : 0})`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Length Histogram */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="mb-4 text-sm font-medium">Längen-Verteilung (Zeichen)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.lengthHistogram} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--ds-text-subtle)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--ds-text-subtle)" />
                <Tooltip
                  formatter={(value: number) => [fmt(value), "Chunks"]}
                  contentStyle={{
                    backgroundColor: "var(--ds-surface)",
                    border: "1px solid var(--ds-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.lengthHistogram.map((entry: LengthBucket) => (
                    <Cell key={entry.bucket} fill={LENGTH_COLORS[entry.bucket] ?? "var(--ds-text-subtle)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Per-Source Table */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="mb-4 text-sm font-medium">Pro Source</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-[color:var(--ds-text)]">
              <thead>
                <tr className="border-b text-left text-xs text-[color:var(--ds-text-subtle)]">
                  <th scope="col" className="pb-2 pr-3 font-medium">Source</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Pages</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Chunks</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Embedded</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Coverage</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Ø Länge</th>
                </tr>
              </thead>
              <tbody>
                {data.perSource.map((r: SourceRow) => (
                  <tr
                    key={r.source}
                    onClick={() => onSelectSource?.(r.source)}
                    onKeyDown={(e) => {
                      if (onSelectSource && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSelectSource(r.source);
                      }
                    }}
                    role={onSelectSource ? "button" : undefined}
                    tabIndex={onSelectSource ? 0 : undefined}
                    aria-label={onSelectSource ? `${r.source} im Chunk-Inspector öffnen` : undefined}
                    className={onSelectSource
                      ? "border-b transition-colors hover:bg-[color:var(--ds-surface-hover)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]"
                      : "border-b transition-colors hover:bg-[color:var(--ds-surface-hover)]"}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{r.source}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.pages)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.chunks)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.embedded)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={r.coveragePct}
                          className="h-2 w-20"
                        />
                        <span className="text-xs tabular-nums text-[color:var(--ds-text-subtle)]">
                          {pct(r.coveragePct)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-xs">
                      {fmt(r.avgLength)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
