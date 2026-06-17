"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isOnline, setCache, getCache } from "./offline-store";

interface UseOfflineSyncOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  enabled?: boolean;
}

export function useOfflineSync<T>({ key, fetcher, enabled = true }: UseOfflineSyncOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(() => !isOnline());
  const hasFetched = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetcher();
      await setCache(key, fresh);
      setData(fresh);
      setIsOffline(false);
    } catch (err) {
      const cached = await getCache<T>(key);
      if (cached) {
        setData(cached);
        setIsOffline(true);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, enabled]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    void refresh();

    const onOnline = () => { setIsOffline(false); void refresh(); };
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  return { data, loading, error, isOffline, refresh };
}

/** Hook that tracks network status */
export function useNetworkStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(isOnline());
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}
