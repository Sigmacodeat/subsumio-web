"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Shared data-fetching hook for client-side components.
 *
 * Eliminates 25+ copies of the same `useState(loading/error) + useCallback
 * + useEffect + cancelled flag` pattern across dashboard pages and panels.
 *
 * Features:
 *   - Automatic cancellation on unmount (no stale state updates)
 *   - Consistent loading / error / data state
 *   - Manual refetch capability
 *   - Conditional fetching (skip when `enabled` is false)
 *   - Dependency-based re-fetching
 *
 * @example
 * const { data, loading, error, refetch } = useApiQuery(
 *   () => csrfFetch("/api/brain-quality").then(r => r.json()),
 *   []
 * );
 *
 * @example Conditional fetch
 * const { data } = useApiQuery(
 *   () => fetch(`/api/matter-context/${caseSlug}`).then(r => r.json()),
 *   [caseSlug],
 *   { enabled: !!caseSlug }
 * );
 */

export interface UseApiQueryOptions {
  /** Skip the fetch when false. Defaults to true. */
  enabled?: boolean;
  /** Initial data before the first fetch completes. */
  initialData?: unknown;
}

export interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  options: UseApiQueryOptions = {}
): UseApiQueryResult<T> {
  const { enabled = true, initialData = null } = options;

  const [data, setData] = useState<T | null>(initialData as T | null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const execute = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mountedRef.current && requestIdRef.current === currentRequestId) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current && requestIdRef.current === currentRequestId) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler");
        setData(null);
      }
    } finally {
      if (mountedRef.current && requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      void execute();
    } else {
      setLoading(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, execute]);

  const refetch = useCallback(async () => {
    await execute();
  }, [execute]);

  return { data, loading, error, refetch };
}
