"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  FileText,
  Loader2,
  Zap,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Layers,
  Flame,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";

interface CaseRow {
  slug: string;
  title: string;
  status: string;
  pipelineStatus: string | null;
  pipelineScore: number | null;
  verjaehrungScore: number | null;
  verjaehrungStatus: string | null;
  documentCount: number;
  updatedAt: string;
}

type SortKey = "verjaehrung" | "score" | "updated" | "status";

export default function AltlastenPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("verjaehrung");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [batchTriggering, setBatchTriggering] = useState(false);
  const [wiedervorlageTriggering, setWiedervorlageTriggering] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all legal_case pages
      const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });

      const rows: CaseRow[] = await Promise.all(
        pages.map(async (page) => {
          const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
          const slug = page.slug;

          // Check for pipeline state page
          let pipelineStatus: string | null = null;
          let pipelineScore: number | null = null;
          let verjaehrungScore: number | null = null;
          let verjaehrungStatus: string | null = null;

          try {
            // Try to get pipeline state
            const stateSlug = `pipeline/state-${slug}`;
            const statePage = await api.brain.getPage(stateSlug).catch(() => null);
            if (statePage) {
              const stateFm = (statePage.frontmatter ?? {}) as Record<string, unknown>;
              pipelineStatus = String(stateFm.status ?? stateFm.pipeline_status ?? null);
              pipelineScore = typeof stateFm.total_score === "number" ? stateFm.total_score : null;
            }

            // Try to get limitation scan
            const limSlug = `limitation-scan/${slug}`;
            const limPage = await api.brain.getPage(limSlug).catch(() => null);
            if (limPage) {
              const limFm = (limPage.frontmatter ?? {}) as Record<string, unknown>;
              verjaehrungScore =
                typeof limFm.verjaehrung_risiko_score === "number"
                  ? limFm.verjaehrung_risiko_score
                  : null;
              if (verjaehrungScore !== null) {
                if (verjaehrungScore >= 75) verjaehrungStatus = "urgent";
                else if (verjaehrungScore >= 50) verjaehrungStatus = "warning";
                else verjaehrungStatus = "ok";
              }
            }
          } catch {
            // best effort
          }

          const documents = (fm.documents as Array<Record<string, unknown>>) ?? [];

          return {
            slug,
            title: page.title ?? slug,
            status: String(fm.status ?? "open"),
            pipelineStatus,
            pipelineScore,
            verjaehrungScore,
            verjaehrungStatus,
            documentCount: documents.length,
            updatedAt: page.updated_at ?? "",
          };
        })
      );

      setCases(rows);
    } catch (err) {
      addToast({
        type: "error",
        title: "Fehler beim Laden",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Auto-refresh polling: when any case has pipeline_status running/resuming,
  // poll every 10 seconds until all are done.
  useEffect(() => {
    if (!autoRefresh) return;
    const hasRunning = cases.some(
      (c) => c.pipelineStatus === "running" || c.pipelineStatus === "resuming"
    );
    if (!hasRunning) {
      setAutoRefresh(false);
      return;
    }
    const interval = setInterval(() => {
      fetchCases();
    }, 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh, cases, fetchCases]);

  const sortedCases = useMemo(() => {
    const filtered = filterStatus ? cases.filter((c) => c.status === filterStatus) : cases;

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "verjaehrung":
          // Urgent first (highest score first), nulls last
          const aScore = a.verjaehrungScore ?? -1;
          const bScore = b.verjaehrungScore ?? -1;
          return bScore - aScore;
        case "score":
          const aPipe = a.pipelineScore ?? -1;
          const bPipe = b.pipelineScore ?? -1;
          return bPipe - aPipe;
        case "updated":
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return sorted;
  }, [cases, sortKey, filterStatus]);

  const urgentCount = cases.filter((c) => c.verjaehrungStatus === "urgent").length;
  const warningCount = cases.filter((c) => c.verjaehrungStatus === "warning").length;
  const pipelineRan = cases.filter((c) => c.pipelineStatus !== null).length;
  const pipelineNotRan = cases.filter((c) => c.pipelineStatus === null).length;

  const handleBatchTrigger = useCallback(async () => {
    const slugsToTrigger =
      selectedSlugs.size > 0
        ? Array.from(selectedSlugs)
        : sortedCases
            .filter((c) => c.pipelineStatus === null && c.documentCount > 0)
            .map((c) => c.slug);

    if (slugsToTrigger.length === 0) {
      addToast({
        type: "info",
        title: "Keine Akten",
        description: "Keine Akten ohne Pipeline-Status gefunden.",
        duration: 3000,
      });
      return;
    }

    setBatchTriggering(true);
    try {
      const res = await csrfFetch("/api/legal/batch-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slugs: slugsToTrigger,
          parallel: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      addToast({
        type: "success",
        title: "Batch-Pipeline gestartet",
        description: `${result.succeeded}/${result.total} Akten gestartet, ${result.failed} fehlgeschlagen.`,
        duration: 5000,
      });

      // Start auto-refresh polling
      setAutoRefresh(true);
      // Refresh after a delay
      setTimeout(() => fetchCases(), 5000);
    } catch (err) {
      addToast({
        type: "error",
        title: "Batch-Trigger fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        duration: 5000,
      });
    } finally {
      setBatchTriggering(false);
    }
  }, [selectedSlugs, sortedCases, addToast, fetchCases]);

  const handleWiedervorlage = useCallback(async () => {
    const urgentCases = cases.filter(
      (c) => c.verjaehrungStatus === "urgent" && c.verjaehrungScore !== null
    );

    if (urgentCases.length === 0) {
      addToast({
        type: "info",
        title: "Keine dringenden Fälle",
        description: "Keine Akten mit URGENT-Verjährung gefunden.",
        duration: 3000,
      });
      return;
    }

    setWiedervorlageTriggering(true);
    let succeeded = 0;
    let failed = 0;

    for (const c of urgentCases) {
      try {
        // Fetch limitation scan to get urgent_ansprueche
        const limPage = await api.brain.getPage(`limitation-scan/${c.slug}`).catch(() => null);
        if (!limPage) {
          failed++;
          continue;
        }

        const fm = (limPage.frontmatter ?? {}) as Record<string, unknown>;
        // Read urgent_ansprueche from frontmatter (stored as JSON string by the pipeline)
        const rawUrgent = fm.urgent_ansprueche;
        let fmUrgent: unknown[] = [];
        if (Array.isArray(rawUrgent)) {
          fmUrgent = rawUrgent;
        } else if (typeof rawUrgent === "string") {
          try {
            fmUrgent = JSON.parse(rawUrgent) as unknown[];
          } catch {
            fmUrgent = [];
          }
        }
        const urgentAnsprueche =
          fmUrgent.length > 0
            ? fmUrgent.map((u: unknown) => {
                const r = u as Record<string, unknown>;
                return {
                  anspruch: String(r.anspruch ?? "Unbekannter Anspruch"),
                  restzeit_tage: typeof r.restzeit_tage === "number" ? r.restzeit_tage : 30,
                  paragraph: String(r.paragraph ?? ""),
                  handlungsbedarf: String(
                    r.handlungsbedarf ?? "Sofortige Prüfung und Klageerhebung erforderlich"
                  ),
                };
              })
            : [
                {
                  anspruch: "Verjährung droht",
                  restzeit_tage: 30,
                  paragraph: String(fm.law ?? ""),
                  handlungsbedarf: "Sofortige Prüfung und Klageerhebung erforderlich",
                },
              ];

        const res = await csrfFetch("/api/legal/wiedervorlage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_slug: c.slug,
            verjaehrung_score: c.verjaehrungScore!,
            urgent_ansprueche: urgentAnsprueche,
          }),
        });

        if (res.ok) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
    }

    addToast({
      type: succeeded > 0 ? "success" : "error",
      title: "Wiedervorlage erstellt",
      description: `${succeeded} Wiedervorlagen erstellt, ${failed} fehlgeschlagen.`,
      duration: 5000,
    });

    setWiedervorlageTriggering(false);
    setTimeout(() => fetchCases(), 3000);
  }, [cases, addToast, fetchCases]);

  const toggleSelection = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Altlasten-Bearbeitung"
        description="Massenbearbeitung alter Akten — priorisiert nach Verjährungsrisiko"
        actions={
          <div className="flex gap-2">
            <Button
              onClick={handleWiedervorlage}
              disabled={wiedervorlageTriggering || urgentCount === 0}
              variant="outline"
              className="gap-2"
            >
              {wiedervorlageTriggering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              Wiedervorlage ({urgentCount})
            </Button>
            <Button onClick={handleBatchTrigger} disabled={batchTriggering} className="gap-2">
              {batchTriggering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {selectedSlugs.size > 0
                ? `Pipeline für ${selectedSlugs.size} starten`
                : `Batch-Pipeline starten (${pipelineNotRan})`}
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-600">Verjährung URGENT</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{urgentCount}</p>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium text-amber-600">Verjährung WARNUNG</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{warningCount}</p>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium text-blue-600">Pipeline durchgeführt</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-600">{pipelineRan}</p>
        </div>
        <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Ohne Pipeline</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-600">{pipelineNotRan}</p>
        </div>
      </div>

      {/* Sort & Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
          <span className="text-sm text-[color:var(--ds-text-muted)]">Sortieren:</span>
          {(["verjaehrung", "score", "updated", "status"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                sortKey === key
                  ? "bg-[color:var(--brand-primary)] text-white"
                  : "bg-[color:var(--ds-surface-2)] hover:bg-[color:var(--ds-surface-2)]/80"
              )}
            >
              {key === "verjaehrung" && "Verjährung"}
              {key === "score" && "Pipeline-Score"}
              {key === "updated" && "Aktualisiert"}
              {key === "status" && "Status"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[color:var(--ds-text-muted)]">Filter:</span>
          <button
            onClick={() => setFilterStatus(null)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              !filterStatus
                ? "bg-[color:var(--brand-primary)] text-white"
                : "bg-[color:var(--ds-surface-2)] hover:bg-[color:var(--ds-surface-2)]/80"
            )}
          >
            Alle
          </button>
          {["open", "pending", "dormant"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                filterStatus === s
                  ? "bg-[color:var(--brand-primary)] text-white"
                  : "bg-[color:var(--ds-surface-2)] hover:bg-[color:var(--ds-surface-2)]/80"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Cases Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--ds-surface-2)]/50">
            <tr>
              <th className="w-10 p-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedSlugs.size === sortedCases.length && sortedCases.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSlugs(new Set(sortedCases.map((c) => c.slug)));
                    } else {
                      setSelectedSlugs(new Set());
                    }
                  }}
                  className="rounded"
                />
              </th>
              <th className="p-3 text-left font-medium">Akte</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Pipeline</th>
              <th className="p-3 text-left font-medium">Verjährung</th>
              <th className="p-3 text-right font-medium">Dokumente</th>
              <th className="p-3 text-right font-medium">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {sortedCases.map((row) => (
              <tr
                key={row.slug}
                className={cn(
                  "border-t transition-colors hover:bg-[color:var(--ds-surface-2)]/30",
                  selectedSlugs.has(row.slug) && "bg-[color:var(--brand-primary)]/5"
                )}
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selectedSlugs.has(row.slug)}
                    onChange={() => toggleSelection(row.slug)}
                    className="rounded"
                  />
                </td>
                <td className="p-3">
                  <button
                    onClick={() => router.push(`/dashboard/cases/${encodeURIComponent(row.slug)}`)}
                    className="text-left font-medium hover:underline"
                  >
                    {row.title}
                  </button>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">{row.slug}</p>
                </td>
                <td className="p-3">
                  <Badge variant="default" className="text-xs">
                    {row.status}
                  </Badge>
                </td>
                <td className="p-3">
                  {row.pipelineStatus ? (
                    <div className="flex items-center gap-2">
                      {row.pipelineStatus === "completed" || row.pipelineStatus === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : row.pipelineStatus === "running" || row.pipelineStatus === "resuming" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      ) : row.pipelineStatus === "failed" ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-xs">{row.pipelineStatus}</span>
                      {row.pipelineScore !== null && (
                        <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                          ({row.pipelineScore}/100)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-[color:var(--ds-text-muted)]">—</span>
                  )}
                </td>
                <td className="p-3">
                  {row.verjaehrungStatus === "urgent" && (
                    <Badge className="gap-1 border-red-500/20 bg-red-500/10 text-red-600">
                      <Flame className="h-3 w-3" />
                      URGENT ({row.verjaehrungScore})
                    </Badge>
                  )}
                  {row.verjaehrungStatus === "warning" && (
                    <Badge className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      WARNUNG ({row.verjaehrungScore})
                    </Badge>
                  )}
                  {row.verjaehrungStatus === "ok" && (
                    <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      OK ({row.verjaehrungScore})
                    </Badge>
                  )}
                  {row.verjaehrungStatus === null && (
                    <span className="text-xs text-[color:var(--ds-text-muted)]">—</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <span className="flex items-center justify-end gap-1 text-xs">
                    <FileText className="h-3 w-3 text-[color:var(--ds-text-muted)]" />
                    {row.documentCount}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(`/dashboard/cases/${encodeURIComponent(row.slug)}`)}
                  >
                    Öffnen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedCases.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-4 h-12 w-12 text-[color:var(--ds-text-muted)]" />
          <p className="text-[color:var(--ds-text-muted)]">
            Keine Akten gefunden. Laden Sie Akten hoch, um die Altlasten-Bearbeitung zu starten.
          </p>
        </div>
      )}
    </div>
  );
}
