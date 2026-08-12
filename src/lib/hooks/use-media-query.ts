"use client";

import * as React from "react";

/**
 * SSR-safe `useMediaQuery`. Nutzt `useSyncExternalStore` — kein
 * Hydration-Mismatch, kein "stale snapshot", automatisches Cleanup des
 * matchMedia-Listeners.
 *
 * @param query CSS Media Query, z.B. "(max-width: 768px)"
 * @param serverFallback Wert während SSR (default false = Desktop-First).
 *   Bei Mobile-First-Seiten true übergeben, damit SSR das Mobile-Layout
 *   rendert und Desktop nach Hydration updatet.
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : serverFallback,
    () => serverFallback,
  );
}
