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
  /** true solange angezeigte Daten aus dem Cache stammen und der
   *  frische Fetch noch läuft/fehlgeschlagen ist (SWR-Pattern). */
  const [isStale, setIsStale] = useState(false);
  const hasFetched = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // SWR: Cache sofort zeigen (bei Online ebenso — schneller erster
    // Paint), dann fresh nachladen. Fetch-Fehler behält den Cache.
    const cached = await getCache<T>(key);
    if (cached != null) {
      setData(cached);
      setIsStale(true);
    }
    try {
      const fresh = await fetcher();
      await setCache(key, fresh);
      setData(fresh);
      setIsStale(false);
      setIsOffline(false);
    } catch (err) {
      if (cached != null) {
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

    const onOnline = () => {
      setIsOffline(false);
      void refresh();
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  return { data, loading, error, isOffline, isStale, refresh };
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
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
