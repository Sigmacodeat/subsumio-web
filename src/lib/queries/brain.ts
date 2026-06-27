"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BrainStats, BrainPage, SearchResult, GraphNode, GraphLink, RecentQuery } from "@/lib/types";
import { api } from "@/lib/api";

// ── Queries ──

export function useBrainStats() {
  return useQuery<BrainStats>({
    queryKey: ["brain", "stats"],
    queryFn: () => api.brain.stats(),
    // The brain-status indicator (sidebar pill, chat header dot) reads this
    // query directly — without a refetch interval it only updates on
    // remount/explicit invalidation, so an engine outage that recovers
    // mid-session never clears from the UI until the user navigates away
    // and back. 30s matches the cadence of other dashboard polling.
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}

export function useSearch(q: string, limit = 10, enabled = true) {
  return useQuery<SearchResult[]>({
    queryKey: ["brain", "search", q, limit],
    queryFn: () => api.brain.search(q, limit),
    enabled: enabled && q.length > 0,
  });
}

export function usePage(slug: string) {
  return useQuery<BrainPage>({
    queryKey: ["brain", "page", slug],
    queryFn: () => api.brain.getPage(slug),
    enabled: slug.length > 0,
  });
}

export function usePages(opts?: {
  limit?: number;
  offset?: number;
  source?: string;
  type?: string;
  tag?: string;
}) {
  return useQuery<BrainPage[]>({
    queryKey: ["brain", "pages", opts],
    queryFn: () => api.brain.listPages(opts),
  });
}

export function useGraph() {
  return useQuery<{ nodes: GraphNode[]; links: GraphLink[] }>({
    queryKey: ["brain", "graph"],
    queryFn: () => api.brain.graph(),
  });
}

export function useRecentQueries(limit = 10) {
  return useQuery({
    queryKey: ["brain", "queries", "recent", limit],
    queryFn: () => api.brain.recentQueries(limit),
  });
}

export interface CockpitData {
  stats: BrainStats | null;
  recent: RecentQuery[];
  pages: Record<string, BrainPage[]>;
}

export function useCockpitData(opts?: {
  types?: string;
  recentLimit?: number;
  enabled?: boolean;
}) {
  return useQuery<CockpitData>({
    queryKey: ["brain", "cockpit", opts],
    queryFn: () => api.brain.cockpit(opts),
    enabled: opts?.enabled ?? true,
  });
}

// ── Mutations ──

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (page: {
      slug: string;
      title: string;
      content?: string;
      type?: string;
      frontmatter?: Record<string, unknown>;
    }) => api.brain.createPage(page),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain", "pages"] });
      qc.invalidateQueries({ queryKey: ["brain", "stats"] });
      qc.invalidateQueries({ queryKey: ["brain", "cockpit"] });
    },
  });
}

export function useUpdatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (page: {
      slug: string;
      title?: string;
      content?: string;
      type?: string;
      frontmatter?: Record<string, unknown>;
    }) => api.brain.updatePage(page),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["brain", "pages"] });
      qc.invalidateQueries({ queryKey: ["brain", "page", vars.slug] });
      qc.invalidateQueries({ queryKey: ["brain", "cockpit"] });
    },
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.brain.deletePage(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain", "pages"] });
      qc.invalidateQueries({ queryKey: ["brain", "stats"] });
      qc.invalidateQueries({ queryKey: ["brain", "cockpit"] });
    },
  });
}
