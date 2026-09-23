/**
 * Geteilte Query-Definitionen für den Corpus-Steward-Dateibrowser.
 * CorpusFileBrowser konsumiert sie via useQuery, die Ops-Page prefetched
 * dieselben Keys bei Tab-Hover — so können die Definitionen nicht
 * auseinanderdriften.
 */

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  modified: string;
  flag: string | null;
}

export interface ListResponse {
  corpus: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  files: FileEntry[];
  indexMissing: boolean;
  indexStale: boolean;
}

export interface SearchResult {
  path: string;
  name: string;
  snippet?: string;
  matchIn: "filename" | "content" | "both";
}

export interface SearchResponse {
  query: string;
  corpus: string;
  total: number;
  results: SearchResult[];
}

export interface SampleResponse {
  corpus: string;
  total: number;
  sample: FileEntry[];
}

export type CorpusFileSort = "name" | "date" | "size";
export type CorpusSearchMode = "list" | "search" | "sample";

type Params = { get(name: string): string | null };

/** Welcher Query-Typ gerade aktiv ist — identisch für Browser und Prefetch. */
export function corpusSearchMode(params: Params): CorpusSearchMode {
  const q = params.get("q") ?? "";
  return params.get("mode") === "sample" ? "sample" : q ? "search" : "list";
}

/** URL-Parameter der Listenansicht — identisch für Browser und Prefetch. */
export function corpusListParams(params: Params): {
  page: number;
  sort: CorpusFileSort;
  flag: string;
} {
  const rawPage = parseInt(params.get("page") ?? "1", 10);
  return {
    // ?page=abc → NaN würde sonst in Query-Key und Request landen.
    page: Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1,
    sort: (params.get("sort") as CorpusFileSort) ?? "name",
    flag: params.get("flag") ?? "all",
  };
}

async function fetchJson(url: string, fallback: string): Promise<unknown> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message ?? fallback);
  }
  const json = await res.json();
  return json.data ?? json;
}

export function corpusFileListQuery(
  corpus: string,
  page: number,
  sort: CorpusFileSort,
  flag: string
) {
  return {
    queryKey: ["corpus-files-list", corpus, page, sort, flag] as const,
    queryFn: async (): Promise<ListResponse> => {
      const params = new URLSearchParams({
        corpus,
        page: String(page),
        pageSize: "50",
        sort,
        flag,
      });
      return (await fetchJson(
        `/api/admin/corpus-files/list?${params}`,
        "Liste nicht ladbar"
      )) as ListResponse;
    },
    staleTime: 30_000,
  };
}

export function corpusFileSearchQuery(corpus: string, q: string) {
  return {
    queryKey: ["corpus-files-search", corpus, q] as const,
    queryFn: async (): Promise<SearchResponse> => {
      const params = new URLSearchParams({ corpus, q, limit: "50", mode: "both" });
      return (await fetchJson(
        `/api/admin/corpus-files/search?${params}`,
        "Suche fehlgeschlagen"
      )) as SearchResponse;
    },
  };
}

export function corpusFileSampleQuery(corpus: string) {
  return {
    queryKey: ["corpus-files-sample", corpus] as const,
    queryFn: async (): Promise<SampleResponse> =>
      (await fetchJson(
        `/api/admin/corpus-files/sample?corpus=${encodeURIComponent(corpus)}&n=20`,
        "Stichprobe fehlgeschlagen"
      )) as SampleResponse,
  };
}
