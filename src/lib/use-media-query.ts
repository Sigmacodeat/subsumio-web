"use client";

import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    function handler(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}

export function useIsMediumScreen(): boolean {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}
