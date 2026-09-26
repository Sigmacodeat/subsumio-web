"use client";

import { usePathname } from "next/navigation";
import MarketingShell from "./marketing-shell";
import RefConsentBanner from "./ref-consent";
import AnalyticsConsentBanner from "./analytics-consent";
import { useMarket } from "@/lib/use-market";

function isAuthedOrApi(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/ops") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/addin-connect") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/forgot") ||
    /^\/en\/(login|signup|reset|forgot)/.test(pathname) ||
    pathname.startsWith("/api")
  );
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const { ui: UI_STRINGS } = useMarket();
  const pathname = usePathname();
  const hasOwnMain =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/addin-connect") ||
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
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[color:var(--brand-solid)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
      >
        {UI_STRINGS.skipToContent}
      </a>
      <MarketingShell>{pageContent}</MarketingShell>
      <RefConsentBanner />
      <AnalyticsConsentBanner />
    </>
  );
}
