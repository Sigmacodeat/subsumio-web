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
  Flame,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import Link from "next/link";
import { cn, encodeSlugPath } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { csrfFetch } from "@/lib/csrf";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { EmptyState } from "@/components/dashboard/empty-state";

interface CaseRow {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  pipelineStatus: string | null;
  pipelineScore: number | null;
  verjaehrungScore: number | null;
  verjaehrungStatus: string | null;
  documentCount: number;
  updatedAt: string;
}

type SortKey = "verjaehrung" | "score" | "updated" | "status";

const SORT_LABELS: Record<SortKey, string> = {
  verjaehrung: "Verjährung",
  score: "Prüfergebnis",
  updated: "Zuletzt geändert",
  status: "Status",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  pending: "Anhängig",
  settled: "Erledigt",
  won: "Gewonnen",
  lost: "Verloren",
  appealed: "Berufung",
  dormant: "Ruhend",
  archived: "Archiviert",
};

/** Engine run states → lawyer wording (raw states never reach the UI). */
const PIPELINE_LABELS: Record<string, string> = {
  completed: "Geprüft",
  done: "Geprüft",
  running: "Läuft",
  resuming: "Läuft",
  failed: "Fehlgeschlagen",
  pending: "Wartet",
  queued: "Wartet",
  partial: "Teilweise",
};

export default function AltlastenPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { t } = useLang();

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("verjaehrung");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [batchTriggering, setBatchTriggering] = useState(false);
  const [wiedervorlageTriggering, setWiedervorlageTriggering] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      // Fetch all legal_case pages
      // listAllPages pages past the engine's 200-row cap and drops tombstones.
      const pages = (await api.brain.listAllPages({ type: "legal_case" })).filter(
        (p) => String((p.frontmatter ?? {}).status ?? "") !== "archived"
      );

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
            caseNumber: typeof fm.case_number === "string" ? fm.case_number : "",
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
    } catch {
      setLoadFailed(true);
      addToast({
        type: "error",
        title: t("altlasten.err_load"),
        description:
          "Die Bestandsakten konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

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
        description: "Keine ungeprüften Akten gefunden.",
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
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();
      addToast({
        type: "success",
        title: "Verjährungsprüfung gestartet",
        description:
          result.failed > 0
            ? `${result.succeeded} von ${result.total} Akten gestartet, ${result.failed} nicht möglich.`
            : `${result.succeeded} von ${result.total} Akten gestartet.`,
        duration: 5000,
      });

      // Start auto-refresh polling
      setAutoRefresh(true);
      // Refresh after a delay
      setTimeout(() => fetchCases(), 5000);
    } catch {
      addToast({
        type: "error",
        title: "Prüfung konnte nicht gestartet werden",
        description: "Bitte versuchen Sie es in einigen Minuten erneut.",
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
        description: "Keine Akte hat eine dringende Verjährungswarnung.",
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
      title: succeeded > 0 ? "Wiedervorlage erstellt" : "Wiedervorlage fehlgeschlagen",
      description:
        failed > 0
          ? `${succeeded} Wiedervorlagen erstellt, ${failed} nicht möglich.`
          : `${succeeded} Wiedervorlagen erstellt.`,
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

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
      active
        ? "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
        : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
    );

  const kpis = [
    {
      label: "Verjährung dringend",
      value: urgentCount,
      tone: "text-[color:var(--ds-danger-text)]",
    },
    {
      label: "Verjährung zu beachten",
      value: warningCount,
      tone: "text-[color:var(--ds-warning-text)]",
    },
    { label: "Geprüft", value: pipelineRan, tone: "" },
    { label: "Ungeprüft", value: pipelineNotRan, tone: "" },
  ];

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("altlasten.title")}
        description={t("altlasten.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("cases.title"), href: "/dashboard/cases" },
          { label: t("altlasten.title") },
        ]}
        actions={
          <div className="flex gap-2">
            {urgentCount > 0 && (
              <Button
                onClick={handleWiedervorlage}
                disabled={wiedervorlageTriggering}
                loading={wiedervorlageTriggering}
                variant="secondary"
                className="gap-2 whitespace-nowrap"
              >
                {!wiedervorlageTriggering && <BellRing className="h-4 w-4" aria-hidden="true" />}
                Wiedervorlage anlegen ({urgentCount})
              </Button>
            )}
            <PrimaryAction
              icon={!batchTriggering && <Zap size={15} aria-hidden="true" />}
              onClick={handleBatchTrigger}
              disabled={
                batchTriggering || loading || (selectedSlugs.size === 0 && pipelineNotRan === 0)
              }
              loading={batchTriggering}
            >
              {selectedSlugs.size > 0
                ? `${selectedSlugs.size} ${selectedSlugs.size === 1 ? "Akte" : "Akten"} prüfen`
                : `Ungeprüfte prüfen${pipelineNotRan > 0 ? ` (${pipelineNotRan})` : ""}`}
            </PrimaryAction>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">{k.label}</div>
            <div
              className={cn(
                "mt-1 text-2xl leading-none font-semibold tabular-nums",
                k.value > 0 && k.tone ? k.tone : "text-[color:var(--ds-text)]"
              )}
            >
              {loading ? <Skeleton className="h-6 w-8" /> : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sort & Filter Controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sortierung">
          <ArrowUpDown
            className="h-3.5 w-3.5 text-[color:var(--ds-text-muted)]"
            aria-hidden="true"
          />
          {(["verjaehrung", "score", "updated", "status"] as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={sortKey === key}
              onClick={() => setSortKey(key)}
              className={chip(sortKey === key)}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          {[null, "open", "pending", "dormant"].map((s) => (
            <button
              key={s ?? "all"}
              type="button"
              aria-pressed={filterStatus === s}
              onClick={() => setFilterStatus(s)}
              className={chip(filterStatus === s)}
            >
              {s ? STATUS_LABELS[s] : "Alle"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-live="polite">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : loadFailed ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title={t("altlasten.err_load")}
            description="Die Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut."
            actionLabel={t("common.retry")}
            onAction={() => void fetchCases()}
          />
        </div>
      ) : sortedCases.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Keine Bestandsakten"
          description={
            filterStatus
              ? "Für diesen Status gibt es keine Akten."
              : "Sobald Akten angelegt oder importiert sind, erscheinen sie hier zur Prüfung."
          }
          actionLabel={filterStatus ? "Filter zurücksetzen" : "Akten importieren"}
          onAction={() =>
            filterStatus ? setFilterStatus(null) : router.push("/dashboard/bulk-cases")
          }
        />
      ) : (
        <div className="@container overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--ds-surface-2)] text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    aria-label="Alle Akten auswählen"
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
                <th className="hidden px-3 py-2 text-left whitespace-nowrap @2xl:table-cell">
                  Aktenzeichen
                </th>
                <th className="px-3 py-2 text-left">Akte</th>
                <th className="hidden px-3 py-2 text-left @3xl:table-cell">Status</th>
                <th className="px-3 py-2 text-left">Prüfung</th>
                <th className="px-3 py-2 text-left">Verjährung</th>
                <th className="hidden px-3 py-2 text-right @2xl:table-cell">Dokumente</th>
              </tr>
            </thead>
            <tbody>
              {sortedCases.map((row) => (
                <tr
                  key={row.slug}
                  className={cn(
                    "border-t border-[color:var(--ds-border)] transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none",
                    selectedSlugs.has(row.slug) && "bg-[color:var(--ds-hover)]"
                  )}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${row.title} auswählen`}
                      checked={selectedSlugs.has(row.slug)}
                      onChange={() => toggleSelection(row.slug)}
                      className="rounded"
                    />
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs whitespace-nowrap text-[color:var(--ds-text-muted)] tabular-nums @2xl:table-cell">
                    {row.caseNumber || "—"}
                  </td>
                  <td className="max-w-[18rem] px-3 py-2">
                    <Link
                      href={`/dashboard/cases/${encodeSlugPath(row.slug)}`}
                      className="block truncate font-medium text-[color:var(--ds-text)] hover:underline"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-[color:var(--ds-text-muted)] @3xl:table-cell">
                    {STATUS_LABELS[row.status] ?? row.status}
                  </td>
                  <td className="px-3 py-2">
                    {row.pipelineStatus ? (
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {row.pipelineStatus === "completed" || row.pipelineStatus === "done" ? (
                          <CheckCircle2
                            className="h-3.5 w-3.5 text-[color:var(--ds-success-text)]"
                            aria-hidden="true"
                          />
                        ) : row.pipelineStatus === "running" ||
                          row.pipelineStatus === "resuming" ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin text-[color:var(--ds-info-text)]"
                            aria-hidden="true"
                          />
                        ) : row.pipelineStatus === "failed" ? (
                          <XCircle
                            className="h-3.5 w-3.5 text-[color:var(--ds-danger-text)]"
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock
                            className="h-3.5 w-3.5 text-[color:var(--ds-text-subtle)]"
                            aria-hidden="true"
                          />
                        )}
                        <span className="text-xs">
                          {PIPELINE_LABELS[row.pipelineStatus] ?? row.pipelineStatus}
                        </span>
                        {row.pipelineScore !== null && (
                          <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                            {row.pipelineScore}/100
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[color:var(--ds-text-muted)]">Ungeprüft</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.verjaehrungStatus === "urgent" && (
                      <Badge variant="danger" className="gap-1 text-xs">
                        <Flame className="h-3 w-3" aria-hidden="true" />
                        Dringend · {row.verjaehrungScore}
                      </Badge>
                    )}
                    {row.verjaehrungStatus === "warning" && (
                      <Badge variant="warning" className="gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Beachten · {row.verjaehrungScore}
                      </Badge>
                    )}
                    {row.verjaehrungStatus === "ok" && (
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        Unkritisch · {row.verjaehrungScore}
                      </span>
                    )}
                    {row.verjaehrungStatus === null && (
                      <span className="text-xs text-[color:var(--ds-text-subtle)]">—</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-right text-xs tabular-nums @2xl:table-cell">
                    {row.documentCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
