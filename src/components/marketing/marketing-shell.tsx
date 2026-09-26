"use client";

// Shared marketing shell — renders the persistent chrome (nav, background,
// footer, scroll progress, back-to-top) that stays mounted across all
// marketing page navigations.  This prevents the header from unmounting
// and remounting on every route change, which caused a full-page visual
// reload effect.
//
// The shell is rendered by the root layout for marketing routes only.
// Each page component keeps its own <MotionConfig> and data-tone wrapper
// for page-specific theming, but no longer renders the shared chrome.

import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import { MarketingBackground, MarketingNav, MarketingFooter } from "./chrome";
import { ScrollProgress } from "./motion-system";
import BackToTop from "./back-to-top";

// The chat widget is only needed after a click: its own chunk, loaded after
// hydration, so it stays out of the initial bundle of every landing page.
const ConciergeWidget = dynamic(() => import("./concierge/concierge-widget"), {
  ssr: false,
  loading: () => null,
});
export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <MarketingBackground />
      <MarketingNav />
      {children}
      <MarketingFooter />
      <BackToTop />
      <ConciergeWidget />
    </MotionConfig>
  );
}
