"use client";

import { usePathname } from "next/navigation";
import MarketingShell from "./marketing-shell";
import RefConsentBanner from "./ref-consent";
import AnalyticsConsentBanner from "./analytics-consent";
import { UI_STRINGS } from "@/content/site";

function isAuthedOrApi(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/ops") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/forgot") ||
    /^\/en\/(login|signup|reset|forgot)/.test(pathname) ||
    pathname.startsWith("/api")
  );
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hasOwnMain =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/ops") ||
    pathname.startsWith("/portal");
  const isMarketingPage = !isAuthedOrApi(pathname);

  const pageContent = hasOwnMain ? (
    children
  ) : (
    <main id="main-content" role="main">
      {children}
    </main>
  );

  if (!isMarketingPage) {
    return <>{pageContent}</>;
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[color:var(--brand-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
      >
        {UI_STRINGS.skipToContent}
      </a>
      <MarketingShell>{pageContent}</MarketingShell>
      <RefConsentBanner />
      <AnalyticsConsentBanner />
    </>
  );
}
