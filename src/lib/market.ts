// Market layer — resolves the public marketing market ("at" | "de") for a
// pathname or request, and bundles every content object under one accessor
// so components read contentFor(market).ui instead of juggling imports.

import {
  FOOTER,
  LANDING,
  NAV,
  pFor,
  PRICING_FAQ,
  PRODUCT_DEMO,
  SCROLL_STORY,
  UI_STRINGS,
  VALUE_PROPS,
  type Market,
} from "@/content/site";
import { FOOTER_DE, LANDING_DE, NAV_DE, PRODUCT_DEMO_DE, UI_STRINGS_DE } from "@/content/site-de";

export type { Market };
export { pFor };

/** Detect the market from a pathname. Default: "at" (canonical market). */
export function marketFromPath(pathname: string | null | undefined): Market {
  if (pathname === "/de" || pathname?.startsWith("/de/")) return "de";
  return "at";
}

/** Market-aware path builder — bind once per render: const p = pBind(market) */
export function pBind(market: Market) {
  return (path: string) => pFor(market, path);
}

export interface MarketContent {
  nav: typeof NAV;
  footer: typeof FOOTER;
  landing: typeof LANDING;
  ui: Record<string, string>;
  pricingFaq: typeof PRICING_FAQ;
  valueProps: typeof VALUE_PROPS;
  scrollStory: typeof SCROLL_STORY;
  productDemo: typeof PRODUCT_DEMO;
}

const AT: MarketContent = {
  nav: NAV,
  footer: FOOTER,
  landing: LANDING,
  ui: UI_STRINGS,
  pricingFaq: PRICING_FAQ,
  valueProps: VALUE_PROPS,
  scrollStory: SCROLL_STORY,
  productDemo: PRODUCT_DEMO,
};

const DE: MarketContent = {
  nav: NAV_DE,
  footer: FOOTER_DE,
  landing: LANDING_DE,
  ui: UI_STRINGS_DE,
  pricingFaq: PRICING_FAQ,
  valueProps: VALUE_PROPS,
  scrollStory: SCROLL_STORY,
  productDemo: PRODUCT_DEMO_DE,
};

export function contentFor(market: Market): MarketContent {
  return market === "de" ? DE : AT;
}
