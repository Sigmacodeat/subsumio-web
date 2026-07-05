"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Check if a feature flag is enabled for the current user.
 * Returns { enabled, isLoading }.
 *
 * @example
 * const { enabled, isLoading } = useFeatureFlag("deep_analysis");
 * if (isLoading) return null;
 * if (!enabled) return null;
 * return <DeepAnalysisComponent />;
 */
export function useFeatureFlag(key: string) {
  const { data, isLoading } = useQuery<{ key?: string; enabled: boolean }>({
    queryKey: ["feature-flag", key],
    queryFn: () => api.featureFlags.check(key),
    staleTime: 60 * 1000,
  });

  return {
    enabled: data?.enabled ?? false,
    isLoading,
  };
}

/**
 * Check multiple feature flags at once.
 * Returns a map of flag key -> boolean enabled state.
 *
 * @example
 * const flags = useFeatureFlags(["deep_analysis", "precedent_search"]);
 * if (flags.deep_analysis) { ... }
 */
export function useFeatureFlags(keys: string[]) {
  const { data, isLoading } = useQuery<{
    flags?: Array<{ key: string; name: string; enabled: boolean }>;
  }>({
    queryKey: ["feature-flags", "check-all", keys.join(",")],
    queryFn: () => api.featureFlags.check(),
    staleTime: 60 * 1000,
  });

  const map: Record<string, boolean> = {};
  for (const f of data?.flags ?? []) {
    map[f.key] = f.enabled;
  }

  return { flags: map, isLoading };
}
