/**
 * Geteilte Query-Definitionen für die Corpus-Ops-Tabs (Bestand/Protokoll).
 * Die Komponenten konsumieren sie via useQuery, die Ops-Page prefetched
 * dieselben Keys bei Tab-Hover — Keys, Fetcher und staleTime können so
 * nicht auseinanderdriften.
 */

import type { CorpusOverview } from "@/lib/corpus-labels";
import type { CoverageAuditResult } from "@/lib/corpus-completeness-audit";
import type { DeStatuteCoverage } from "@/lib/de-statute-coverage";
import type { IngestLogPage } from "@/lib/corpus-labels";
import type { LawCoverageResponse, LawDetailResponse } from "@/lib/law-coverage";

export type CoverageAuditResponse = CoverageAuditResult & {
  de_statutes: (DeStatuteCoverage & { unavailable?: boolean }) | null;
};

async function fetchData<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return ((await r.json()) as { data: T }).data;
}

export function corpusCoverageAuditQuery() {
  return {
    queryKey: ["corpus-coverage-audit"] as const,
    queryFn: () => fetchData<CoverageAuditResponse>("/api/admin/corpus-coverage-audit"),
    staleTime: 300_000,
  };
}

export function corpusOverviewQuery() {
  return {
    queryKey: ["corpus-overview"] as const,
    queryFn: () => fetchData<CorpusOverview>("/api/admin/corpus-overview"),
    staleTime: 60_000,
  };
}

export function corpusLawCoverageQuery(source: string) {
  return {
    queryKey: ["corpus-law-coverage", source] as const,
    queryFn: () =>
      fetchData<LawCoverageResponse>(
        `/api/admin/corpus-law-coverage?source=${encodeURIComponent(source)}`
      ),
    staleTime: 60_000,
  };
}

/** Ein Gesetz für /ops/corpus/gesetz/… — ungekürzte Fehlliste + gespeicherte §§. */
export function corpusLawDetailQuery(source: string, key: string) {
  return {
    queryKey: ["corpus-law-detail", source, key] as const,
    queryFn: () =>
      fetchData<LawDetailResponse>(
        `/api/admin/corpus-law-coverage/law?source=${encodeURIComponent(source)}&key=${encodeURIComponent(key)}`
      ),
    staleTime: 30_000,
  };
}

export function corpusIngestLogQuery(params: URLSearchParams) {
  const qs = params.toString();
  return {
    queryKey: ["corpus-ingest-log", qs] as const,
    queryFn: () => fetchData<IngestLogPage>(`/api/admin/corpus-ingest-log?${qs}`),
  };
}
