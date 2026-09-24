"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CommandCenterGate,
  PipelineSection,
  RisDeltaSection,
  SyncStatusSection,
  TrustSection,
  WorkQueueSection,
  useCorpusCommandCenterData,
} from "@/components/dashboard/corpus-command-center";
import { CorpusBestand } from "@/components/dashboard/corpus-bestand";
import { CorpusProtokoll } from "@/components/dashboard/corpus-protokoll";
import { ChunkInspector } from "@/components/dashboard/chunk-inspector";
import { ChunkQuality } from "@/components/dashboard/chunk-quality";
import { CorpusFileBrowser } from "@/components/dashboard/corpus-steward/CorpusFileBrowser";
import { CorpusFileViewer } from "@/components/dashboard/corpus-steward/CorpusFileViewer";
import { PublishBanner } from "@/components/dashboard/corpus-steward/PublishBanner";
import { CorpusAlertBanner } from "@/components/dashboard/corpus-steward/CorpusAlertBanner";
import {
  corpusFileListQuery,
  corpusFileSampleQuery,
  corpusFileSearchQuery,
  corpusListParams,
  corpusSearchMode,
} from "@/components/dashboard/corpus-steward/corpus-files-queries";
import {
  corpusCoverageAuditQuery,
  corpusIngestLogQuery,
  corpusOverviewQuery,
} from "@/components/dashboard/corpus-ops-queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { ShieldCheck, Library, Activity, type LucideIcon } from "lucide-react";

const TAB_IDS = ["bestand", "pipeline", "qualitaet"] as const;
type TabId = (typeof TAB_IDS)[number];

// Alte ?tab=-Links landen auf dem passenden neuen Reiter — geteilte Links
// und Browser-Verläufe bleiben gültig.
const LEGACY_TABS: Record<string, TabId> = {
  "command-center": "bestand",
  protokoll: "pipeline",
  "chunk-inspector": "qualitaet",
  "chunk-quality": "qualitaet",
  steward: "qualitaet",
};

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "bestand", label: "Bestand & Abgleich", icon: Library },
  { id: "pipeline", label: "Pipeline & Protokoll", icon: Activity },
  { id: "qualitaet", label: "Qualität & Inspektor", icon: ShieldCheck },
];

export default function CorpusPage() {
  // Tab in der URL (?tab=) — Refresh und geteilte Links landen auf dem
  // richtigen Reiter statt immer auf „Bestand".
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawTab = searchParams.get("tab") ?? "bestand";
  const activeTab: TabId = (TAB_IDS as readonly string[]).includes(rawTab)
    ? (rawTab as TabId)
    : (LEGACY_TABS[rawTab] ?? "bestand");
  const tabHref = useCallback(
    (v: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (v === "bestand") params.delete("tab");
      else params.set("tab", v);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [searchParams, pathname]
  );
  const setActiveTab = useCallback(
    (v: string) => {
      router.replace(tabHref(v as TabId), { scroll: false });
    },
    [router, tabHref]
  );
  const [selectedSource, setSelectedSource] = useState("all");
  const [stewardCorpus, setStewardCorpus] = useState("at-judikatur-vwgh");
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Hover/Focus-Prefetch auf die schweren Tabs: der Klick rendert dann aus
  // dem Query-Cache statt mit Skeleton-Wartezeit. Die Keys/Fetcher spiegeln
  // die Default-Queries der Ziel-Komponenten — driftet ein Default dort,
  // degradiert der Prefetch lautlos zum normalen Fetch (kein Fehlerpfad).
  const prefetchTab = useCallback(
    (id: TabId) => {
      if (id === "bestand") {
        void queryClient.prefetchQuery(corpusCoverageAuditQuery());
        void queryClient.prefetchQuery(corpusOverviewQuery());
      } else if (id === "pipeline") {
        // Default-Ansicht des Protokolls: PAGE_SIZE=50, offset 0,
        // kein Filter — CorpusProtokoll baut dieselbe Param-Menge.
        void queryClient.prefetchQuery(
          corpusIngestLogQuery(new URLSearchParams({ limit: "50", offset: "0" }))
        );
      } else if (id === "qualitaet") {
        // Dieselbe Param-Ableitung wie CorpusFileBrowser (corpusSearchMode /
        // corpusListParams) — die URL-Params überleben den Tabwechsel, der
        // Prefetch muss daher exakt den Query treffen, den die Komponente
        // beim Mount stellen wird.
        const mode = corpusSearchMode(searchParams);
        if (mode === "list") {
          const { page, sort, flag } = corpusListParams(searchParams);
          void queryClient.prefetchQuery(corpusFileListQuery(stewardCorpus, page, sort, flag));
        } else if (mode === "search") {
          const q = searchParams.get("q") ?? "";
          if (q.length >= 2)
            void queryClient.prefetchQuery(corpusFileSearchQuery(stewardCorpus, q));
        } else {
          void queryClient.prefetchQuery(corpusFileSampleQuery(stewardCorpus));
        }
      }
    },
    [queryClient, searchParams, stewardCorpus]
  );

  // Unread corpus-alerts count for badge on Übersicht tab
  const { data: alertData } = useQuery<{ unreadCount: number }>({
    queryKey: ["corpus-alerts-badge"],
    queryFn: async () => {
      const res = await fetch("/api/admin/corpus-alerts?unread=true&limit=1", {
        credentials: "same-origin",
      });
      if (!res.ok) return { unreadCount: 0 };
      const json = await res.json();
      const d = json.data ?? json;
      return { unreadCount: d.unreadCount ?? 0 };
    },
    refetchInterval: 60_000,
  });
  const unreadAlerts = alertData?.unreadCount ?? 0;

  // Beim Reiterwechsel an den Anfang springen — aber NICHT beim ersten
  // Rendern: kommt der Nutzer von einer Gesetzes-Detailseite zurück
  // (/ops/corpus?…#gesetz-…), holt die Liste die Zeile selbst wieder ins Bild.
  // The ops shell has no scrolling <main>; the whole document scrolls, hence
  // window.scrollTo. Instant, not smooth: clicking through tabs quickly would
  // otherwise stack overlapping scroll animations.
  const prevTab = useRef(activeTab);
  useEffect(() => {
    if (prevTab.current === activeTab) return;
    prevTab.current = activeTab;
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab]);

  // Höhe der klebenden Reiterleiste als CSS-Variable: Spaltenköpfe langer
  // Listen kleben direkt darunter (top: var(--corpus-sticky-top)) statt
  // unter ihr zu verschwinden — auch wenn die Leiste auf dem Handy umbricht.
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    const tabs = tabsRef.current;
    if (!root || !tabs || typeof ResizeObserver === "undefined") return;
    const apply = () =>
      root.style.setProperty("--corpus-sticky-top", `${tabs.getBoundingClientRect().height}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(tabs);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Rechtskorpus"
        description="Bestand, Eingang und Abgleich mit dem RIS — Stand der Datenbank auf dem Server"
      />
      <CorpusAlertBanner />
      <PublishBanner />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Sticky unter dem Viewport-Rand: auf langen Listen (Bestand,
            Protokoll) bleibt der Reiterwechsel erreichbar ohne hochzuscrollen.
            Labels immer sichtbar — Icon-only-Tabs sind auf Touch unklar. */}
        <TabsList
          ref={tabsRef}
          className="sticky top-0 z-20 flex h-auto w-full [scrollbar-width:none] justify-start gap-1 overflow-x-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Trigger sind echte Links (asChild → <a role="tab">): Rechtsklick
              „Link kopieren" und Middle-Click funktionieren nativ, normaler
              Klick bleibt SPA-Tabwechsel ohne Reload. */}
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              asChild
              className="flex min-h-10 shrink-0 items-center gap-1.5 px-3 py-2"
            >
              <a
                href={tabHref(id)}
                onClick={(e) => e.preventDefault()}
                onMouseEnter={() => prefetchTab(id)}
                onFocus={() => prefetchTab(id)}
                className="no-underline"
              >
                <Icon className="h-4 w-4" />
                {label}
                {id === "pipeline" && unreadAlerts > 0 && (
                  <span
                    className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--ds-info-bg)] px-1.5 text-xs font-semibold text-[color:var(--ds-info-text)]"
                    aria-label={`${unreadAlerts} ungelesene Corpus-Alerts`}
                  >
                    {unreadAlerts}
                  </span>
                )}
              </a>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="bestand" className="mt-4 space-y-6">
          <SyncChainSection
            onSelectCorpus={(source) => {
              setSelectedSource(source);
              setActiveTab("qualitaet");
              // Der Qualitäts-Tab mountet erst nach dem Wechsel — Scroll
              // verzögert, damit der Inspektor bereits existiert.
              const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
              setTimeout(
                () =>
                  document
                    .getElementById("chunk-inspector")
                    ?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" }),
                50
              );
            }}
          />
          <CorpusBestand />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4 space-y-6">
          <PipelineSections />
          <CorpusProtokoll />
        </TabsContent>

        <TabsContent value="qualitaet" className="mt-4 space-y-6">
          <ChunkQuality
            onSelectSource={(sourceId) => {
              setSelectedSource(sourceId);
              setActiveTab("qualitaet");
              // Die Quality-Tabelle steht ÜBER dem Inspektor — ohne Scroll
              // bliebe die Auswahl unsichtbar.
              const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
              document
                .getElementById("chunk-inspector")
                ?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
            }}
          />
          <div id="chunk-inspector" className="scroll-mt-24">
            <ChunkInspector initialSource={selectedSource} />
          </div>
          <TrustSections />
          <CorpusFileBrowser
            onSelectFile={setViewerPath}
            selectedCorpus={stewardCorpus}
            onCorpusChange={setStewardCorpus}
          />
        </TabsContent>
      </Tabs>

      {/* File Viewer Dialog (über allen Tabs) */}
      <CorpusFileViewer path={viewerPath} onClose={() => setViewerPath(null)} />
    </div>
  );
}

/** Die klare Linie RIS-Soll → Disk → DB pro Quelle — aus den geteilten
 *  Command-Center-Daten (ein Fetch für alle Tabs). */
function SyncChainSection({ onSelectCorpus }: { onSelectCorpus: (sourceId: string) => void }) {
  const query = useCorpusCommandCenterData();
  return (
    <CommandCenterGate query={query}>
      {(d) => (
        <SyncStatusSection
          rows={d.sync.rows}
          totals={d.sync.totals}
          dbAvailable={d.dbAvailable}
          snapshotAt={d.snapshotAt ?? null}
          onSelectCorpus={onSelectCorpus}
          onRefresh={() => query.refetch()}
        />
      )}
    </CommandCenterGate>
  );
}

/** Pipeline-Live + RIS-Delta-Watcher — der operative Teil des Protokoll-Tabs. */
function PipelineSections() {
  const query = useCorpusCommandCenterData();
  return (
    <CommandCenterGate query={query}>
      {(d) => (
        <>
          <PipelineSection
            paused={d.pipeline.paused}
            states={d.pipeline.states}
            live={d.pipeline.live ?? []}
            risFetchers={d.pipeline.risFetchers ?? []}
            onActionComplete={() => query.refetch()}
          />
          {d.risDelta && (
            <RisDeltaSection
              rows={d.risDelta.rows}
              triggerPending={d.risDelta.triggerPending}
              onActionComplete={() => query.refetch()}
            />
          )}
        </>
      )}
    </CommandCenterGate>
  );
}

/** Work Queue + Trust — die Steward-Seite des Qualitäts-Tabs. */
function TrustSections() {
  const query = useCorpusCommandCenterData();
  return (
    <CommandCenterGate query={query}>
      {(d) => (
        <>
          <WorkQueueSection
            items={d.workQueue.items}
            total={d.workQueue.total}
            defective={d.workQueue.defective}
            needsReview={d.workQueue.needsReview}
            verified={d.workQueue.verified}
          />
          <TrustSection rows={d.trust.rows} totals={d.trust.totals} />
        </>
      )}
    </CommandCenterGate>
  );
}
