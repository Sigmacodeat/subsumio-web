"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CorpusCommandCenter } from "@/components/dashboard/corpus-command-center";
import { CorpusBestand } from "@/components/dashboard/corpus-bestand";
import { CorpusProtokoll } from "@/components/dashboard/corpus-protokoll";
import { ChunkInspector } from "@/components/dashboard/chunk-inspector";
import { ChunkQuality } from "@/components/dashboard/chunk-quality";
import { CorpusFileBrowser } from "@/components/dashboard/corpus-steward/CorpusFileBrowser";
import { CorpusFileViewer } from "@/components/dashboard/corpus-steward/CorpusFileViewer";
import { PublishBanner } from "@/components/dashboard/corpus-steward/PublishBanner";
import { CorpusAlertBanner } from "@/components/dashboard/corpus-steward/CorpusAlertBanner";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Database,
  Search,
  ShieldCheck,
  FileText,
  Library,
  History,
  type LucideIcon,
} from "lucide-react";

const TAB_IDS = [
  "bestand",
  "protokoll",
  "command-center",
  "chunk-inspector",
  "chunk-quality",
  "steward",
] as const;
type TabId = (typeof TAB_IDS)[number];

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "bestand", label: "Bestand", icon: Library },
  { id: "protokoll", label: "Protokoll", icon: History },
  { id: "command-center", label: "Übersicht", icon: Database },
  { id: "chunk-inspector", label: "Chunk-Inspektor", icon: Search },
  { id: "chunk-quality", label: "Qualität", icon: ShieldCheck },
  { id: "steward", label: "Steward", icon: FileText },
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
    : "bestand";
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
      const json = async (url: string) => {
        const r = await fetch(url, { credentials: "same-origin" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return ((await r.json()) as { data: unknown }).data;
      };
      if (id === "bestand") {
        void queryClient.prefetchQuery({
          queryKey: ["corpus-coverage-audit"],
          queryFn: () => json("/api/admin/corpus-coverage-audit"),
          staleTime: 300_000,
        });
        void queryClient.prefetchQuery({
          queryKey: ["corpus-overview"],
          queryFn: () => json("/api/admin/corpus-overview"),
          staleTime: 60_000,
        });
      } else if (id === "protokoll") {
        void queryClient.prefetchQuery({
          queryKey: ["corpus-ingest-log", "limit=50&offset=0"],
          queryFn: () => json("/api/admin/corpus-ingest-log?limit=50&offset=0"),
        });
      }
    },
    [queryClient]
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

  useEffect(() => {
    // The ops shell (OpsShell) has no independent scrolling <main> — its id
    // is "ops-main", not "main-content" (that id belongs to the *dashboard*
    // layout), and even "ops-main" never sets overflow-y: the whole document
    // scrolls. `getElementById("main-content")` was always null here, so
    // this reset silently never ran — switch to a tab further down the page
    // and every other tab opened mid-scroll instead of at its own top.
    // Instant, not smooth: a context switch should land immediately: an
    // animated scroll here fights whatever position the new tab's own layout
    // settles into, and clicking through tabs quickly stacks overlapping
    // scroll animations.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab]);

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
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
        <TabsList className="sticky top-0 z-20 flex h-auto w-full [scrollbar-width:none] justify-start gap-1 overflow-x-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                {id === "command-center" && unreadAlerts > 0 && (
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
          <CorpusBestand />
        </TabsContent>

        <TabsContent value="protokoll" className="mt-4 space-y-6">
          <CorpusProtokoll />
        </TabsContent>

        <TabsContent value="command-center" className="mt-4 space-y-6">
          <CorpusCommandCenter
            onSelectCorpus={(source) => {
              setSelectedSource(source);
              setActiveTab("chunk-inspector");
            }}
          />
        </TabsContent>

        <TabsContent value="chunk-inspector" className="mt-4 space-y-6">
          <ChunkInspector initialSource={selectedSource} />
        </TabsContent>

        <TabsContent value="chunk-quality" className="mt-4 space-y-6">
          <ChunkQuality
            onSelectSource={(sourceId) => {
              setSelectedSource(sourceId);
              setActiveTab("chunk-inspector");
            }}
          />
        </TabsContent>

        <TabsContent value="steward" className="mt-4 space-y-6">
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
