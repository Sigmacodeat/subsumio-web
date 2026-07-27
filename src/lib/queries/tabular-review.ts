"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TabularReviewRun, TabularReviewStartRequest } from "@/lib/types";

/**
 * Async Tabular Review (Massen-Dokumentenanalyse) — start/poll/retry hooks.
 *
 * The engine job persists its run state after EVERY document, so polling the
 * run endpoint shows row-level progress live. Polling stops automatically once
 * the run reaches a terminal status (done / partial / failed); a retry flips
 * the run back to "queued", which re-arms the polling interval via the
 * invalidated query below.
 */

/** Poll cadence while a run is queued/running (matches server per-row writes). */
const RUN_POLL_INTERVAL_MS = 2500;

function isRunActive(run: TabularReviewRun | undefined): boolean {
  return run?.status === "queued" || run?.status === "running";
}

/** Poll a run's status/result. Pass `null` to disable. */
export function useTabularReviewRun(runSlug: string | null) {
  return useQuery<TabularReviewRun>({
    queryKey: ["legal", "tabular-review", "run", runSlug],
    queryFn: () => api.legal.tabularReviewRun(runSlug!),
    enabled: !!runSlug,
    refetchInterval: (query) => (isRunActive(query.state.data) ? RUN_POLL_INTERVAL_MS : false),
    // Keep the previous snapshot visible while a poll revalidates — avoids
    // table flicker every 2.5s.
    placeholderData: (prev) => prev,
  });
}

/** Start a new async run. The page navigates to `?run=<run_slug>` on success. */
export function useTabularReviewStart() {
  return useMutation({
    mutationFn: (input: TabularReviewStartRequest) => api.legal.tabularReviewStart(input),
  });
}

/**
 * Retry failed rows of a run. `slugs` omitted → all error rows. After a
 * successful retry the run is "queued" again; invalidating the run query
 * triggers an immediate refetch and re-arms the polling interval.
 */
export function useTabularReviewRetry(runSlug: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slugs?: string[]) => api.legal.tabularReviewRetry(runSlug!, slugs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legal", "tabular-review", "run", runSlug] });
    },
  });
}

/** Case (Akte) options for the "Akte" document-selection mode. */
export function useLegalCaseOptions() {
  return useQuery({
    queryKey: ["brain", "pages", "tabular-review-case-options"],
    queryFn: () => api.brain.listPages({ type: "legal_case", limit: 250 }),
    staleTime: 60_000,
  });
}
