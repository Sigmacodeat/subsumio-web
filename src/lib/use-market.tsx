"use client";

// Client-side market context — set once per route tree by the /at and /de
// layouts. Every client marketing component calls useMarket() and gets the
// market-bound path helper (p) plus the full content bundle (landing, ui,
// nav, footer, …). Server components take a `market` prop instead and call
// contentFor(market) from ./market directly.

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { contentFor, marketFromPath, pBind, type Market, type MarketContent } from "./market";

const MarketContext = createContext<Market | null>(null);

export function MarketProvider({ market, children }: { market: Market; children: ReactNode }) {
  return <MarketContext.Provider value={market}>{children}</MarketContext.Provider>;
}

export interface MarketApi extends MarketContent {
  market: Market;
  /** Market-bound path builder: p("/pricing") → "/de/pricing" on /de. */
  p: (path: string) => string;
}

export function useMarket(): MarketApi {
  const ctx = useContext(MarketContext);
  // Fallback for components rendered outside a MarketProvider (tests,
  // Storybook): derive from the URL so behaviour matches the visible route.
  const pathname = usePathname();
  const market = ctx ?? marketFromPath(pathname);
  return { market, p: pBind(market), ...contentFor(market) };
}
