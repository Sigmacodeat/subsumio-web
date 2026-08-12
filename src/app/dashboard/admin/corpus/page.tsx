"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CorpusCommandCenter } from "@/components/dashboard/corpus-command-center";
import { ChunkInspector } from "@/components/dashboard/chunk-inspector";
import { PageHeader } from "@/components/dashboard/page-header";
import { Database, Search } from "lucide-react";

export default function CorpusPage() {
  const [activeTab, setActiveTab] = useState("command-center");
  const [selectedSource, setSelectedSource] = useState("all");

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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="command-center" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="chunk-inspector" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Chunk-Inspektor
          </TabsTrigger>
        </TabsList>
        <TabsContent value="command-center" className="space-y-6 mt-4">
          <CorpusCommandCenter onSelectCorpus={(source) => { setSelectedSource(source); setActiveTab("chunk-inspector"); }} />
        </TabsContent>
        <TabsContent value="chunk-inspector" className="space-y-6 mt-4">
          <ChunkInspector initialSource={selectedSource} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
