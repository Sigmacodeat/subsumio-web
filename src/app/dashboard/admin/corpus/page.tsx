"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CorpusCommandCenter } from "@/components/dashboard/corpus-command-center";
import { ChunkInspector } from "@/components/dashboard/chunk-inspector";
import { ChunkQuality } from "@/components/dashboard/chunk-quality";
import { CorpusFileBrowser } from "@/components/dashboard/corpus-steward/CorpusFileBrowser";
import { CorpusFileViewer } from "@/components/dashboard/corpus-steward/CorpusFileViewer";
import { PublishBanner } from "@/components/dashboard/corpus-steward/PublishBanner";
import { CorpusAlertBanner } from "@/components/dashboard/corpus-steward/CorpusAlertBanner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Database, Search, ShieldCheck, FileText } from "lucide-react";

export default function CorpusPage() {
  const [activeTab, setActiveTab] = useState("command-center");
  const [selectedSource, setSelectedSource] = useState("all");
  const [stewardCorpus, setStewardCorpus] = useState("at-judikatur-vwgh");
  const [viewerPath, setViewerPath] = useState<string | null>(null);

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
    const main = typeof window !== "undefined" ? document.getElementById("main-content") : null;
    if (main) main.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Corpus & Embeddings"
        description="Chunking, Embedding-Coverage und Retrieval-Qualität überwachen"
      />
      <CorpusAlertBanner />
      <PublishBanner />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="command-center" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Übersicht</span>
            {unreadAlerts > 0 && (
              <span
                className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--ds-info-bg)] px-1.5 text-xs font-semibold text-[color:var(--ds-info-text)]"
                aria-label={`${unreadAlerts} ungelesene Corpus-Alerts`}
              >
                {unreadAlerts}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="chunk-inspector" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Chunk-Inspektor</span>
          </TabsTrigger>
          <TabsTrigger value="chunk-quality" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Qualität</span>
          </TabsTrigger>
          <TabsTrigger value="steward" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Steward</span>
          </TabsTrigger>
        </TabsList>

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
