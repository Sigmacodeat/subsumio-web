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

import { MotionConfig } from "framer-motion";
import { MarketingBackground, MarketingNav, MarketingFooter } from "./chrome";
import { ScrollProgress } from "./motion-system";
import BackToTop from "./back-to-top";
import type { Lang } from "@/content/site";

export default function MarketingShell({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <MarketingBackground />
      <MarketingNav lang={lang} />
      {children}
      <MarketingFooter lang={lang} />
      <BackToTop lang={lang} />
    </MotionConfig>
  );
}
