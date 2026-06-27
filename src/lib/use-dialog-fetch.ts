"use client";

import { useEffect, useState } from "react";

/**
 * Fetch data only when a dialog is open, with proper cancellation
 * in ALL callbacks (including finally). Prevents stale state updates
 * after the dialog closes or the component unmounts.
 *
 * Eliminates the duplicated `let cancelled = false; ... .finally(() => setLoading(false))`
 * pattern across QuickCreateDialog components where the `finally` callback
 * was missing the `cancelled` guard.
 *
 * @param open  Only fetch when true
 * @param fetcher  Async function that returns the data
 * @param deps  Additional dependencies that trigger a refetch
 * @returns `{ data, loading, error }`
 */
export function useDialogFetch<T>(
  open: boolean,
  fetcher: () => Promise<T>,
  deps: React.DependencyList = []
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fetch failed");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...deps]);

  return { data, loading, error };
}
