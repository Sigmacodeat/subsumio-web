"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Database,
  HardDrive,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Pause,
  Play,
  Activity,
  FileText,
  Layers,
  ShieldCheck,
  ArrowRight,
  Inbox,
  Archive,
  Globe,
} from "lucide-react";
import { useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const API_BASE = "/api/admin/corpus-command-center";

interface CorpusSyncRow {
  corpus: string;
  sourceId: string;
  diskFiles: number;
  dbPages: number;
  /** Distincte Dokumente in der DB (COUNT DISTINCT import_filename).
   *  Bei Judikatur 1:1 mit dbPages; bei Gesetzen 1 Datei → viele Pages.
   *  Dies ist die korrekte Vergleichsgröße mit RIS Total (Dokumente). */
  dbDocuments: number;
  dbChunks: number;
  embeddedChunks: number;
  staleChunks: number;
  coveragePct: number;
  notImported: number;
  orphanDb: number;
  syncStatus: "synced" | "import_pending" | "orphan_in_db" | "no_db";
  fullyComplete: boolean;
  risTotal: number | null;
  missingFromDb: number;
  missingFromDisk: number;
  diskPending: number;
  newOnRis: number;
  canUpdate: boolean;
  pipelineKey: string | null;
  fetchFruitless: boolean;
}

interface WorkQueueItem {
  path: string;
  corpus: string;
  flag: "defective" | "needs_review";
  note: string;
  flaggedBy: string;
  flaggedAt: string;
}

interface PipelineStateRow {
  source: string;
  stage: string;
  status: string;
  pid: number | null;
  pidCmd: string | null;
  startedAt: string | null;
  lastUpdated: string | null;
  diskCount: number;
  dbPages: number;
  risTotal: number | null;
  alertFlags: Array<{ type: string; severity: string; message: string; raised_at: string }>;
}

interface TrustRow {
  corpus: string;
  verified: number;
  needsReview: number;
  defective: number;
  archived: number;
  unreviewed: number;
  total: number;
}

interface RisDeltaRow {
  applikation: string;
  label: string;
  lastSync: string | null;
  stage: string;
  alerts: Array<{ type: string; severity: string; message: string; raised_at: string }>;
  running: boolean;
}

interface CommandCenterData {
  dbAvailable: boolean;
  sync: {
    rows: CorpusSyncRow[];
    totals: {
      totalDisk: number;
      totalDbPages: number;
      totalDbDocuments: number;
      totalEmbedded: number;
      totalNotImported: number;
      totalStale: number;
      coveragePct: number;
      totalRis: number;
      totalMissingFromDb: number;
      totalMissingFromDisk: number;
      totalNewOnRis: number;
    };
  };
  workQueue: {
    items: WorkQueueItem[];
    total: number;
    defective: number;
    needsReview: number;
    verified: number;
  };
  pipeline: {
    paused: boolean;
    states: PipelineStateRow[];
  };
  trust: {
    rows: TrustRow[];
    totals: {
      verified: number;
      needsReview: number;
      defective: number;
      archived: number;
      unreviewed: number;
    };
  };
  risDelta?: {
    rows: RisDeltaRow[];
    triggerPending: boolean;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("de-DE");
const pct = (n: number) => `${n.toFixed(1)}%`;

const SYNC_STATUS_CONFIG: Record<
  CorpusSyncRow["syncStatus"],
  { variant: "success" | "warning" | "danger" | "default"; label: string }
> = {
  synced: { variant: "success", label: "Synchron" },
  import_pending: { variant: "warning", label: "Lücke" },
  orphan_in_db: { variant: "danger", label: "DB-Orphane" },
  no_db: { variant: "default", label: "Keine DB" },
};

// ── Section 1: Sync-Status ───────────────────────────────────────────────

function SyncStatusSection({
  rows,
  totals,
  onSelectCorpus,
  onRefresh,
}: {
  rows: CorpusSyncRow[];
  totals: CommandCenterData["sync"]["totals"];
  onSelectCorpus?: (sourceId: string) => void;
  onRefresh?: () => void;
}) {
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  // 3-state filter: "incomplete" (default, war hideComplete=true), "all", "complete"
  const filterMode =
    (searchParams.get("filter") as "all" | "incomplete" | "complete" | null) ?? "incomplete";
  const setFilterMode = (mode: "all" | "incomplete" | "complete") => {
    const params = new URLSearchParams(searchParams.toString());
    if (mode === "incomplete")
      params.delete("filter"); // default = kein Param
    else params.set("filter", mode);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const fetchMissing = useMutation({
    mutationFn: async (payload: { action: string; source_key: string }) => {
      const res = await fetch("/api/admin/corpus-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Backfill konnte nicht gestartet werden");
      }
      return res.json();
    },
    onSuccess: (_d, payload) => {
      addToast({ title: `Backfill für ${payload.source_key} gestartet`, type: "success" });
      onRefresh?.();
    },
    onError: (err: Error) => {
      addToast({ title: "Backfill-Fehler", description: err.message, type: "error" });
    },
  });

  const completeCount = rows.filter((r) => r.fullyComplete).length;
  const incompleteCount = rows.length - completeCount;

  const displayRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (filterMode === "complete") return r.fullyComplete;
      if (filterMode === "incomplete") return !r.fullyComplete;
      return true; // "all"
    });
    return filtered.sort((a, b) => {
      if (a.fullyComplete === b.fullyComplete) return 0;
      return a.fullyComplete ? 1 : -1;
    });
  }, [rows, filterMode]);

  const filterLabel =
    filterMode === "all" ? "Alle" : filterMode === "complete" ? "Vollständig" : "Unvollständig";

  return (
    <div className="space-y-4">
      {/* Summary Cards — neutral numbers, icon-only color accent */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Globe className="h-7 w-7 text-[color:var(--ds-info-text)]" />
            <div>
              <p className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                {totals.totalRis != null ? fmt(totals.totalRis) : "—"}
              </p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">RIS OGD</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-7 w-7 text-[color:var(--ds-danger-text)]" />
            <div>
              <p className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                {fmt(totals.totalMissingFromDb)}
              </p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Fehlt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <HardDrive className="h-7 w-7 text-[color:var(--ds-text-muted)]" />
            <div>
              <p className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                {fmt(totals.totalDisk)}
              </p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Disk-Dateien</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Database className="h-7 w-7 text-[color:var(--ds-info-text)]" />
            <div>
              <p
                className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums"
                title={`${fmt(totals.totalDbDocuments)} Dokumente · ${fmt(totals.totalDbPages)} Pages gesamt`}
              >
                {fmt(totals.totalDbDocuments)}
              </p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">DB-Dokumente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-7 w-7 text-[color:var(--ds-success-text)]" />
            <div>
              <p className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                {fmt(totals.totalEmbedded)}
              </p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Embedded</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ArrowRight className="h-7 w-7 text-[color:var(--ds-warning-text)]" />
            <div>
              <p className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                {fmt(totals.totalNotImported)}
              </p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Import-Lücke</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-7 w-7 text-[color:var(--ds-attention-text)]" />
            <div>
              <p className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                {fmt(totals.totalStale)}
              </p>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Stale Chunks</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Corpus Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4" />
              Sync-Status pro Korpus
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Active-Filter Badge (visuell sichtbar — Modern Pattern) */}
              <Badge
                variant={
                  filterMode === "complete"
                    ? "success"
                    : filterMode === "incomplete"
                      ? "warning"
                      : "default"
                }
                className="gap-1 text-[10px]"
                aria-label={`Aktiver Filter: ${filterLabel}, ${displayRows.length} Corpora`}
              >
                {filterLabel} · {fmt(displayRows.length)}
              </Badge>
              {/* 3-Option Select Dropdown */}
              <Select
                value={filterMode}
                onValueChange={(v) => setFilterMode(v as "all" | "incomplete" | "complete")}
              >
                <SelectTrigger
                  className="h-8 w-[180px] text-xs"
                  aria-label="Corpus-Vollständigkeit filtern"
                >
                  <SelectValue placeholder="Filter wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle ({fmt(rows.length)})</SelectItem>
                  <SelectItem value="incomplete" disabled={incompleteCount === 0}>
                    Unvollständig ({fmt(incompleteCount)})
                  </SelectItem>
                  <SelectItem value="complete" disabled={completeCount === 0}>
                    Vollständig ({fmt(completeCount)})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* aria-live announcement für Screen-Reader (WCAG 4.1.3) */}
          <p className="sr-only" aria-live="polite" role="status">
            {displayRows.length} Corpora angezeigt — Filter: {filterLabel}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 border-b pb-2 text-xs font-medium text-[color:var(--ds-text-subtle)]">
              <div className="col-span-3">Korpus</div>
              <div
                className="col-span-1 text-right"
                title="RIS-Dokumente, die noch nicht in der DB sind (— = Volltext nicht verfügbar)"
              >
                RIS
              </div>
              <div
                className="col-span-1 text-right"
                title="Dateien auf Disk, die noch nicht in der DB sind"
              >
                Disk
              </div>
              <div
                className="col-span-1 text-right"
                title="Dokumente in der DB (DISTINCT import_filename). Bei Gesetzen 1 Datei → viele §-Pages; hier wird die Dokument-Anzahl gezeigt, die mit RIS Total vergleichbar ist."
              >
                DB
              </div>
              <div className="col-span-2 text-right" title="Anteil der DB-Chunks mit Embeddings">
                Embedded
              </div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-2 text-center">Aktion</div>
            </div>
            {displayRows.map((r) => {
              const config = r.fullyComplete
                ? { variant: "success" as const, label: "Vollständig" }
                : {
                    variant:
                      SYNC_STATUS_CONFIG[r.syncStatus].variant === "success"
                        ? "warning"
                        : SYNC_STATUS_CONFIG[r.syncStatus].variant,
                    label: "Lücke",
                  };
              return (
                <div
                  key={r.corpus}
                  role="button"
                  tabIndex={0}
                  aria-label={`${r.corpus} im Chunk-Inspector öffnen`}
                  onClick={() => onSelectCorpus?.(r.sourceId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectCorpus?.(r.sourceId);
                    }
                  }}
                  className={cn(
                    "grid cursor-pointer grid-cols-12 items-center gap-2 rounded px-1 py-1.5 text-xs focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none",
                    r.fullyComplete
                      ? "text-[color:var(--ds-text-subtle)] opacity-70 hover:bg-[color:var(--ds-surface-2)]"
                      : "text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-hover)]"
                  )}
                >
                  <div
                    className={cn(
                      "col-span-3 truncate font-mono",
                      r.fullyComplete && "text-[color:var(--ds-success-text)]"
                    )}
                    title={r.corpus}
                  >
                    {r.corpus}
                  </div>
                  <div
                    className="col-span-1 text-right tabular-nums"
                    title={
                      r.fetchFruitless
                        ? `RIS hat ${fmt(r.risTotal ?? 0)} Dokumente, aber deren Volltexte sind nicht verfügbar`
                        : r.risTotal
                          ? `${fmt(r.missingFromDb)} RIS-Dokumente fehlen in DB (RIS ${fmt(r.risTotal)} − DB ${fmt(r.dbDocuments)})`
                          : "RIS-Source nicht aktiv"
                    }
                  >
                    {r.risTotal && !r.fetchFruitless ? (
                      <span
                        className={
                          r.missingFromDb === 0
                            ? "text-[color:var(--ds-success-text)]"
                            : "text-[color:var(--ds-warning-text)]"
                        }
                      >
                        {r.missingFromDb === 0 ? "✓" : fmt(r.missingFromDb)}
                      </span>
                    ) : (
                      <span className="text-[color:var(--ds-text-subtle)]">—</span>
                    )}
                  </div>
                  <div
                    className="col-span-1 text-right tabular-nums"
                    title={`${fmt(r.diskPending)} Dateien auf Disk, noch nicht in DB (Disk ${fmt(r.diskFiles)} − DB ${fmt(r.dbDocuments)})`}
                  >
                    <span
                      className={
                        r.diskPending === 0
                          ? "text-[color:var(--ds-success-text)]"
                          : "text-[color:var(--ds-warning-text)]"
                      }
                    >
                      {r.diskPending === 0 ? "✓" : fmt(r.diskPending)}
                    </span>
                  </div>
                  <div
                    className="col-span-1 text-right tabular-nums"
                    title={`${fmt(r.dbDocuments)} Dokumente · ${fmt(r.dbPages)} Pages (1 Datei → viele §-Abschnitte bei Gesetzen)`}
                  >
                    {fmt(r.dbDocuments)}
                  </div>
                  <div className="col-span-2 text-right tabular-nums">
                    <span
                      className={
                        r.fullyComplete
                          ? "font-medium text-[color:var(--ds-success-text)]"
                          : r.coveragePct >= 90
                            ? "text-[color:var(--ds-success-text)]"
                            : r.coveragePct >= 50
                              ? "text-[color:var(--ds-warning-text)]"
                              : "text-[color:var(--ds-danger-text)]"
                      }
                      title={`${fmt(r.embeddedChunks)} von ${fmt(r.dbChunks)} Chunks embedded`}
                    >
                      {pct(r.coveragePct)}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    <Badge variant={config.variant} className="text-[10px]">
                      {config.label}
                    </Badge>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {r.canUpdate ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={fetchMissing.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (r.pipelineKey)
                            fetchMissing.mutate({
                              action: "fetch_missing",
                              source_key: r.pipelineKey,
                            });
                        }}
                        className="h-6 px-1.5 text-[10px]"
                        title={`Fehlende ${fmt(r.missingFromDb)} für ${r.corpus} nachholen`}
                      >
                        {fetchMissing.isPending ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        <span className="ml-1 hidden lg:inline">Aktualisieren</span>
                      </Button>
                    ) : (
                      <span className="text-[color:var(--ds-text-subtle)]">—</span>
                    )}
                  </div>
                </div>
              );
            })}
            {displayRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                {filterMode === "incomplete" ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-[color:var(--ds-success-text)]" />
                    <p className="text-sm font-medium text-[color:var(--ds-text)]">
                      Alle Corpora sind vollständig!
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-subtle)]">
                      Keine offenen Lücken mehr. Wechsle zu &bdquo;Alle&ldquo; um die Übersicht zu
                      sehen.
                    </p>
                  </>
                ) : filterMode === "complete" ? (
                  <>
                    <Archive className="h-8 w-8 text-[color:var(--ds-text-subtle)]" />
                    <p className="text-sm font-medium text-[color:var(--ds-text)]">
                      Noch keine vollständigen Corpora
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-subtle)]">
                      Sobald ein Corpus 100% Coverage erreicht, erscheint er hier.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    Keine Corpora gefunden.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Section 2: Work Queue ────────────────────────────────────────────────

function WorkQueueSection({
  items,
  total,
  defective,
  needsReview,
  verified,
}: {
  items: WorkQueueItem[];
  total: number;
  defective: number;
  needsReview: number;
  verified: number;
}) {
  const [filter, setFilter] = useState<"all" | "defective" | "needs_review">("defective");
  const [corpusFilter, setCorpusFilter] = useState<string>("");

  const filtered = items.filter((i) => {
    if (filter !== "all" && i.flag !== filter) return false;
    if (corpusFilter && i.corpus !== corpusFilter) return false;
    return true;
  });

  const corpora = [...new Set(items.map((i) => i.corpus))].sort();
  const progress = total > 0 ? (verified / (total + verified)) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Inbox className="h-5 w-5 text-[color:var(--ds-text-subtle)]" />
              <span className="text-2xl font-bold tabular-nums">{fmt(total)}</span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">Offen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <XCircle className="h-5 w-5 text-[color:var(--ds-danger-text)]" />
              <span className="text-2xl font-bold text-[color:var(--ds-danger-text)] tabular-nums">
                {fmt(defective)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">Defective</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <AlertTriangle className="h-5 w-5 text-[color:var(--ds-warning-text)]" />
              <span className="text-2xl font-bold text-[color:var(--ds-warning-text)] tabular-nums">
                {fmt(needsReview)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">Needs Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <CheckCircle2 className="h-5 w-5 text-[color:var(--ds-success-text)]" />
              <span className="text-2xl font-bold text-[color:var(--ds-success-text)] tabular-nums">
                {fmt(verified)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">Verified</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Bearbeitungs-Fortschritt</span>
            <span className="text-sm text-[color:var(--ds-text-subtle)]">
              {fmt(verified)} / {fmt(total + verified)} ({progress.toFixed(1)}%)
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Filter + List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Inbox className="h-4 w-4" /> Work Queue
            </span>
            <div className="flex items-center gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                aria-label="Filter nach Flag"
              >
                <option value="defective">Defective ({defective})</option>
                <option value="needs_review">Needs Review ({needsReview})</option>
                <option value="all">Alle ({total})</option>
              </select>
              <select
                value={corpusFilter}
                onChange={(e) => setCorpusFilter(e.target.value)}
                className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                aria-label="Filter nach Korpus"
              >
                <option value="">Alle Korpora</option>
                {corpora.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[color:var(--ds-text-subtle)]">
              <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-[color:var(--ds-success-text)]/40" />
              Keine Auffälligkeiten in diesem Filter
            </div>
          ) : (
            <div className="max-h-[500px] space-y-1 overflow-y-auto">
              {filtered.map((item) => (
                <div
                  key={item.path}
                  className="flex items-start gap-3 rounded border border-[color:var(--ds-border)] p-2.5 hover:bg-[color:var(--ds-surface-hover)]"
                >
                  <Badge
                    variant={item.flag === "defective" ? "danger" : "warning"}
                    className="mt-0.5 flex-shrink-0 text-[10px]"
                  >
                    {item.flag === "defective" ? "DEFECT" : "REVIEW"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs" title={item.path}>
                      {item.path}
                    </div>
                    <div
                      className="mt-0.5 line-clamp-2 text-xs text-[color:var(--ds-text-subtle)]"
                      title={item.note}
                    >
                      {item.note}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right text-[10px] text-[color:var(--ds-text-subtle)]">
                    {item.flaggedBy === "auto-scan" && (
                      <Badge variant="default" className="mb-1 text-[9px]">
                        AUTO
                      </Badge>
                    )}
                    <div>
                      {item.flaggedAt ? new Date(item.flaggedAt).toLocaleDateString("de-DE") : ""}
                    </div>
                  </div>
                </div>
              ))}
              {total > items.length && (
                <div className="mt-2 border-t py-3 text-center text-xs text-[color:var(--ds-text-subtle)]">
                  Erste {items.length} von {fmt(total)} angezeigt — weitere via Pagination
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Section 3: Pipeline Live ─────────────────────────────────────────────

function PipelineSection({
  paused,
  states,
  onActionComplete,
}: {
  paused: boolean;
  states: PipelineStateRow[];
  onActionComplete?: () => void;
}) {
  const { addToast } = useToast();

  const pipelineAction = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/corpus-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Pipeline-Aktion fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (_d, payload) => {
      const action = payload.action as string;
      const labels: Record<string, string> = {
        pause: "Pipeline pausiert",
        resume: "Pipeline fortgesetzt",
        reembed: "Re-Embed angestoßen",
        fetch_missing: "Fetch angestoßen",
        clear_alerts: "Alerts geleert",
      };
      addToast({ title: labels[action] || "Pipeline-Aktion ausgeführt", type: "success" });
      onActionComplete?.();
    },
    onError: (err: Error) => {
      addToast({ title: "Pipeline-Fehler", description: err.message, type: "error" });
    },
  });

  // Map source_key → sourceId for re-embed
  const sourceKeyToSourceId: Record<string, string> = {
    "statutes-at": "law-at",
    "statutes-de": "law-de",
    "statutes-ch": "law-ch",
    landesrecht: "law-at-landesrecht",
    staatsvertraege: "law-at-staatsvertraege",
    "materialien-de": "law-de-materialien",
    "literatur-de": "law-de-literatur",
    "literatur-at": "law-at-literatur",
    "literatur-ch": "law-ch-literatur",
    "eu-directives": "law-eu-directives",
    "eu-regulations": "law-eu",
    "jud-ogh": "law-at-judikatur-ogh",
    "jud-vfgh": "law-at-judikatur-vfgh",
    "jud-vwgh": "law-at-judikatur-vwgh",
    "jud-bvwg": "law-at-judikatur-bvwg",
    "jud-lvwg": "law-at-judikatur-lvwg",
  };

  const running = states.filter((s) => s.pid !== null);
  const alertStates = states.filter((s) => s.alertFlags.length > 0);
  const gapStates = states.filter(
    (s) => s.risTotal && s.diskCount > 0 && s.diskCount < s.risTotal * 0.95
  );

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity
                className={`h-6 w-6 ${paused ? "text-[color:var(--ds-text-subtle)]" : "animate-pulse text-[color:var(--ds-success-text)]"}`}
              />
              <div>
                <p className="text-sm font-medium">
                  {paused ? "Pipeline pausiert" : "Pipeline aktiv"}
                </p>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {running.length} laufende Stage{running.length !== 1 ? "s" : ""}
                  {alertStates.length > 0 &&
                    ` · ${alertStates.length} Alert${alertStates.length !== 1 ? "s" : ""}`}
                  {gapStates.length > 0 &&
                    ` · ${gapStates.length} Gap${gapStates.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={paused ? "primary" : "outline"}
              onClick={() => pipelineAction.mutate({ action: paused ? "resume" : "pause" })}
              disabled={pipelineAction.isPending}
            >
              {paused ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
              {paused ? "Fortsetzen" : "Pausieren"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Discovery Gap Report */}
      {gapStates.length > 0 && (
        <Card className="border-[color:var(--ds-warning-border)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-[color:var(--ds-warning-text)]" />
              Discovery-Gap ({gapStates.length} Quellen)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {gapStates.map((s) => {
                const gap = s.risTotal! - s.diskCount;
                const gapPct = ((gap / s.risTotal!) * 100).toFixed(1);
                return (
                  <div
                    key={s.source}
                    className="flex items-center gap-3 rounded border border-[color:var(--ds-border)] p-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-mono">{s.source}</span>
                      <span className="ml-2 text-[color:var(--ds-text-subtle)]">
                        Disk: {fmt(s.diskCount)} / RIS: {fmt(s.risTotal!)} —{" "}
                        <span className="font-medium text-[color:var(--ds-warning-text)]">
                          {gapPct}% fehlen
                        </span>
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[10px]"
                      onClick={() =>
                        pipelineAction.mutate({ action: "fetch_missing", source_key: s.source })
                      }
                      disabled={pipelineAction.isPending}
                      aria-label={`Fehlende Dateien für ${s.source} fetchen`}
                    >
                      <ArrowRight className="h-3 w-3" /> Fetch
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* States */}
      {states.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" />
              Pipeline-States ({states.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[500px] space-y-2 overflow-y-auto">
              {states.map((s, i) => {
                const isRunning = s.pid !== null;
                const hasAlerts = s.alertFlags.length > 0;
                const sourceId = sourceKeyToSourceId[s.source] || s.source;
                return (
                  <div
                    key={i}
                    className="space-y-1.5 rounded border border-[color:var(--ds-border)] p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          isRunning
                            ? "success"
                            : s.stage === "done" || s.stage === "ok"
                              ? "default"
                              : s.stage === "failed"
                                ? "danger"
                                : s.stage === "idle" || s.stage === "empty"
                                  ? "default"
                                  : "warning"
                        }
                        className="flex-shrink-0 text-[10px]"
                      >
                        {s.stage}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <span className="font-mono">{s.source}</span>
                        {s.pidCmd && (
                          <span
                            className="ml-2 truncate text-[color:var(--ds-text-subtle)]"
                            title={s.pidCmd}
                          >
                            · PID {s.pid}
                          </span>
                        )}
                      </div>
                      {hasAlerts && (
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 text-[color:var(--ds-warning-text)]" />
                      )}
                      {s.lastUpdated && (
                        <span className="flex-shrink-0 text-[10px] text-[color:var(--ds-text-subtle)]">
                          {new Date(s.lastUpdated).toLocaleTimeString("de-DE")}
                        </span>
                      )}
                    </div>
                    {/* Alert details */}
                    {hasAlerts && (
                      <div className="space-y-1 border-l-2 border-[color:var(--ds-warning-border)] pl-2">
                        {s.alertFlags.map((a, j) => (
                          <div key={j} className="flex items-start gap-2 text-[10px]">
                            <Badge
                              variant={a.severity === "error" ? "danger" : "warning"}
                              className="flex-shrink-0 text-[9px]"
                            >
                              {a.type}
                            </Badge>
                            <span className="flex-1 text-[color:var(--ds-text-subtle)]">
                              {a.message}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1 text-[9px]"
                              onClick={() =>
                                pipelineAction.mutate({
                                  action: "clear_alerts",
                                  source_key: s.source,
                                })
                              }
                              disabled={pipelineAction.isPending}
                              aria-label={`Alerts für ${s.source} leeren`}
                            >
                              Clear
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Re-Embed action for sources with low coverage */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 text-[10px]"
                        onClick={() =>
                          pipelineAction.mutate({ action: "reembed", source: sourceId })
                        }
                        disabled={pipelineAction.isPending}
                        aria-label={`Re-Embed für ${s.source} anstoßen`}
                      >
                        <RefreshCw className="h-3 w-3" /> Re-Embed
                      </Button>
                      {s.risTotal !== null && s.diskCount > 0 && (
                        <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                          Disk: {fmt(s.diskCount)} · DB: {fmt(s.dbPages)} · RIS: {fmt(s.risTotal)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-[color:var(--ds-text-subtle)]">
            <Activity className="mx-auto mb-2 h-10 w-10 text-[color:var(--ds-text-subtle)]/40" />
            Keine Pipeline-States in der DB
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Section 4: Trust Status ──────────────────────────────────────────────

function TrustSection({
  rows,
  totals,
}: {
  rows: TrustRow[];
  totals: CommandCenterData["trust"]["totals"];
}) {
  const total =
    totals.verified + totals.needsReview + totals.defective + totals.archived + totals.unreviewed;
  const verifiedPct = total > 0 ? (totals.verified / total) * 100 : 0;
  const archivedPct = total > 0 ? (totals.archived / total) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Donut Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <ShieldCheck className="h-5 w-5 text-[color:var(--ds-success-text)]" />
              <span className="text-2xl font-bold text-[color:var(--ds-success-text)]">
                {fmt(totals.verified)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
              Verified ({verifiedPct.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Archive className="h-5 w-5 text-[color:var(--ds-text-muted)]" />
              <span className="text-2xl font-bold text-[color:var(--ds-text-muted)]">
                {fmt(totals.archived)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
              Archiviert ({archivedPct.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <AlertTriangle className="h-5 w-5 text-[color:var(--ds-warning-text)]" />
              <span className="text-2xl font-bold text-[color:var(--ds-warning-text)]">
                {fmt(totals.needsReview)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">Needs Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <XCircle className="h-5 w-5 text-[color:var(--ds-danger-text)]" />
              <span className="text-2xl font-bold text-[color:var(--ds-danger-text)]">
                {fmt(totals.defective)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">Defective</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <FileText className="h-5 w-5 text-[color:var(--ds-text-subtle)]" />
              <span className="text-2xl font-bold">{fmt(totals.unreviewed)}</span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">Unreviewed</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Corpus Trust */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4" />
            Trust pro Korpus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] space-y-1.5 overflow-y-auto">
            {rows.map((r) => {
              const total = r.total + r.unreviewed;
              const verifiedPct = total > 0 ? (r.verified / total) * 100 : 0;
              const reviewPct = total > 0 ? (r.needsReview / total) * 100 : 0;
              const defectPct = total > 0 ? (r.defective / total) * 100 : 0;
              const archivedPct = total > 0 ? (r.archived / total) * 100 : 0;
              return (
                <div key={r.corpus} className="rounded border border-[color:var(--ds-border)] p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-xs">{r.corpus}</span>
                    <span className="text-xs text-[color:var(--ds-text-subtle)]">
                      {fmt(r.total + r.unreviewed)} Dateien
                    </span>
                  </div>
                  {/* Stacked Progress Bar */}
                  <div className="flex h-2 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
                    {r.verified > 0 && (
                      <div
                        className="bg-[color:var(--ds-success-solid)]"
                        style={{ width: `${verifiedPct}%` }}
                        title={`Verified: ${r.verified}`}
                      />
                    )}
                    {r.archived > 0 && (
                      <div
                        className="bg-[color:var(--ds-text-muted)]"
                        style={{ width: `${archivedPct}%` }}
                        title={`Archiviert: ${r.archived}`}
                      />
                    )}
                    {r.needsReview > 0 && (
                      <div
                        className="bg-[color:var(--ds-warning-solid)]"
                        style={{ width: `${reviewPct}%` }}
                        title={`Needs Review: ${r.needsReview}`}
                      />
                    )}
                    {r.defective > 0 && (
                      <div
                        className="bg-[color:var(--ds-danger-solid)]"
                        style={{ width: `${defectPct}%` }}
                        title={`Defective: ${r.defective}`}
                      />
                    )}
                  </div>
                  {(r.verified > 0 || r.needsReview > 0 || r.defective > 0 || r.archived > 0) && (
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-[color:var(--ds-text-subtle)]">
                      {r.verified > 0 && (
                        <span className="text-[color:var(--ds-success-text)]">
                          ✓ {fmt(r.verified)}
                        </span>
                      )}
                      {r.archived > 0 && (
                        <span className="text-[color:var(--ds-text-muted)]">
                          📦 {fmt(r.archived)}
                        </span>
                      )}
                      {r.needsReview > 0 && (
                        <span className="text-[color:var(--ds-warning-text)]">
                          ⚠ {fmt(r.needsReview)}
                        </span>
                      )}
                      {r.defective > 0 && (
                        <span className="text-[color:var(--ds-danger-text)]">
                          ✗ {fmt(r.defective)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Section 5: RIS Delta-Watcher ─────────────────────────────────────────

function RisDeltaSection({
  rows,
  triggerPending,
  onActionComplete,
}: {
  rows: RisDeltaRow[];
  triggerPending: boolean;
  onActionComplete: () => void;
}) {
  const { addToast } = useToast();
  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/corpus-command-center/trigger-delta", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      addToast({
        title: "Delta-Sync ausgelöst",
        description: "Der corpus-pipeline wird den Watcher im nächsten Zyklus starten.",
        type: "success",
      });
      onActionComplete();
    },
    onError: (err: Error) => {
      addToast({ title: "Trigger fehlgeschlagen", description: err.message, type: "error" });
    },
  });

  const runningCount = rows.filter((r) => r.running).length;
  const alertCount = rows.reduce((s, r) => s + r.alerts.length, 0);
  const syncedCount = rows.filter((r) => r.stage === "ok" && !r.running).length;
  const idleCount = rows.filter((r) => r.stage === "idle" || !r.lastSync).length;

  const STAGE_CONFIG: Record<
    string,
    { variant: "success" | "warning" | "danger" | "default"; label: string }
  > = {
    idle: { variant: "default", label: "Nie gesynced" },
    running: { variant: "warning", label: "Läuft" },
    ok: { variant: "success", label: "Aktuell" },
    alerts: { variant: "warning", label: "Mit Alerts" },
    failed: { variant: "danger", label: "Fehlgeschlagen" },
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-[color:var(--ds-success-border)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[color:var(--ds-success-text)]" />
              <span className="text-xs text-[color:var(--ds-text-muted)]">Aktuell</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{syncedCount}</p>
          </CardContent>
        </Card>
        <Card className={runningCount > 0 ? "border-[color:var(--ds-warning-border)]" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity
                className={cn(
                  "h-4 w-4",
                  runningCount > 0
                    ? "text-[color:var(--ds-warning-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              />
              <span className="text-xs text-[color:var(--ds-text-muted)]">Läuft</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{runningCount}</p>
          </CardContent>
        </Card>
        <Card className={alertCount > 0 ? "border-[color:var(--ds-danger-border)]" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  alertCount > 0
                    ? "text-[color:var(--ds-danger-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              />
              <span className="text-xs text-[color:var(--ds-text-muted)]">Alerts</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{alertCount}</p>
          </CardContent>
        </Card>
        <Card className={idleCount > 0 ? "border-[color:var(--ds-warning-border)]" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap
                className={cn(
                  "h-4 w-4",
                  idleCount > 0
                    ? "text-[color:var(--ds-warning-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              />
              <span className="text-xs text-[color:var(--ds-text-muted)]">Nie gesynced</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{idleCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Trigger Button */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[color:var(--brand-primary)]" />
                <span className="text-sm font-medium">RIS Delta-Sync</span>
                {triggerPending && (
                  <Badge variant="warning" className="text-xs">
                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                    Trigger anstehend
                  </Badge>
                )}
              </div>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Inkrementeller Sync: holt neue &amp; geänderte Dokumente von RIS OGD API. Läuft
                täglich um 04:30 CEST automatisch.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending || triggerPending}
            >
              {triggerMutation.isPending ? (
                <>
                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> Wird ausgelöst…
                </>
              ) : triggerPending ? (
                <>
                  <Activity className="mr-1 h-3 w-3" /> Trigger aktiv
                </>
              ) : (
                <>
                  <Zap className="mr-1 h-3 w-3" /> Jetzt syncen
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-Applikation Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Database className="h-4 w-4" />
            Applikationen ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-[color:var(--ds-text-muted)]">
              <Zap className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Keine Delta-Watcher-Daten verfügbar.
              <br />
              <span className="text-xs">
                Der Watcher wird beim ersten Pipeline-Zyklus initialisiert.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[color:var(--ds-text-muted)]">
                    <th className="px-4 py-2 font-medium">Applikation</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Letzter Sync</th>
                    <th className="px-4 py-2 font-medium">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const stageCfg = STAGE_CONFIG[row.stage] || STAGE_CONFIG.idle;
                    return (
                      <tr
                        key={row.applikation}
                        className="border-b transition-colors last:border-0 hover:bg-[color:var(--ds-surface-hover)]"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.label}</div>
                          <div className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                            {row.applikation}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {row.running && (
                              <RefreshCw className="h-3 w-3 animate-spin text-[color:var(--ds-warning-text)]" />
                            )}
                            <Badge variant={stageCfg.variant} className="text-xs">
                              {stageCfg.label}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[color:var(--ds-text-muted)]">
                          {row.lastSync ? (
                            <span title={row.lastSync}>
                              {new Date(row.lastSync).toLocaleDateString("de-AT", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}{" "}
                              {new Date(row.lastSync).toLocaleTimeString("de-AT", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : (
                            <span className="opacity-50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.alerts.length > 0 ? (
                            <div className="space-y-1">
                              {row.alerts.slice(0, 3).map((a, i) => (
                                <div key={i} className="flex items-start gap-1 text-xs">
                                  <Badge
                                    variant={a.severity === "error" ? "danger" : "warning"}
                                    className="shrink-0 text-[10px]"
                                  >
                                    {a.severity}
                                  </Badge>
                                  <span
                                    className="max-w-xs truncate text-[color:var(--ds-text-muted)]"
                                    title={a.message}
                                  >
                                    {a.message}
                                  </span>
                                </div>
                              ))}
                              {row.alerts.length > 3 && (
                                <span className="text-xs text-[color:var(--ds-text-muted)]">
                                  +{row.alerts.length - 3} weitere
                                </span>
                              )}
                            </div>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-[color:var(--ds-success-text)]" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export function CorpusCommandCenter({
  onSelectCorpus,
}: { onSelectCorpus?: (sourceId: string) => void } = {}) {
  const [section, setSection] = useState<"sync" | "work" | "pipeline" | "trust" | "delta">("sync");

  const { data, isLoading, isError, error, refetch } = useQuery<CommandCenterData>({
    queryKey: ["corpus-command-center"],
    queryFn: async () => {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error("Command Center Daten nicht ladbar");
      return res.json().then((d) => d.data);
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-7 w-7 rounded" />
                <Skeleton className="mt-2 h-5 w-20" />
                <Skeleton className="mt-1 h-3 w-14" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-8">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-[color:var(--ds-danger-text)]">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Command Center nicht ladbar</span>
          </div>
          <p className="mt-1 ml-7 text-xs text-[color:var(--ds-danger-text)]">
            {(error as Error)?.message}
          </p>
          <Button size="sm" variant="outline" className="mt-3 ml-7" onClick={() => refetch()}>
            <RefreshCw className="mr-1 h-3 w-3" /> Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const sections = [
    { id: "sync" as const, label: "Sync-Status", icon: Layers, count: data.sync.rows.length },
    { id: "work" as const, label: "Work Queue", icon: Inbox, count: data.workQueue.total },
    {
      id: "pipeline" as const,
      label: "Pipeline",
      icon: Activity,
      count: data.pipeline.states.length,
    },
    { id: "trust" as const, label: "Trust", icon: ShieldCheck, count: data.trust.rows.length },
    { id: "delta" as const, label: "RIS Delta", icon: Zap, count: data.risDelta?.rows.length ?? 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <Button
              key={s.id}
              size="sm"
              variant={active ? "primary" : "outline"}
              onClick={() => setSection(s.id)}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              {s.label}
              {s.count > 0 && (
                <Badge variant={active ? "default" : "accent"} className="ml-1 text-[10px]">
                  {fmt(s.count)}
                </Badge>
              )}
            </Button>
          );
        })}
        <div className="flex-1" />
        {!data.dbAvailable && (
          <Badge variant="warning" className="text-xs">
            <AlertTriangle className="mr-1 h-3 w-3" /> DB nicht verbunden
          </Badge>
        )}
        <Button size="sm" variant="ghost" onClick={() => refetch()} aria-label="Aktualisieren">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Section Content */}
      {section === "sync" && (
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="h-32 animate-pulse rounded-lg bg-[color:var(--ds-surface-2)]" />
            </div>
          }
        >
          <SyncStatusSection
            rows={data.sync.rows}
            totals={data.sync.totals}
            onSelectCorpus={onSelectCorpus}
            onRefresh={refetch}
          />
        </Suspense>
      )}
      {section === "work" && (
        <WorkQueueSection
          items={data.workQueue.items}
          total={data.workQueue.total}
          defective={data.workQueue.defective}
          needsReview={data.workQueue.needsReview}
          verified={data.workQueue.verified}
        />
      )}
      {section === "pipeline" && (
        <PipelineSection
          paused={data.pipeline.paused}
          states={data.pipeline.states}
          onActionComplete={() => refetch()}
        />
      )}
      {section === "trust" && <TrustSection rows={data.trust.rows} totals={data.trust.totals} />}
      {section === "delta" && data.risDelta && (
        <RisDeltaSection
          rows={data.risDelta.rows}
          triggerPending={data.risDelta.triggerPending}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}
