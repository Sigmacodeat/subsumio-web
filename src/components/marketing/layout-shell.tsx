"use client";

import { usePathname } from "next/navigation";
import MarketingShell from "./marketing-shell";
import RefConsentBanner from "./ref-consent";
import AnalyticsConsentBanner from "./analytics-consent";
import { UI_STRINGS, type Lang } from "@/content/site";

function detectLang(pathname: string): Lang {
  if (pathname.startsWith("/en")) return "en";
  if (pathname.startsWith("/at")) return "at";
  if (pathname.startsWith("/ch")) return "ch";
  if (pathname.startsWith("/it")) return "it";
  if (pathname.startsWith("/es")) return "es";
  if (pathname.startsWith("/pl")) return "pl";
  if (pathname.startsWith("/fr")) return "fr";
  if (pathname.startsWith("/nl")) return "nl";
  return "de";
}

function isAuthedOrApi(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/forgot") ||
    /^\/(en|it|es|pl|fr|nl)\/(login|signup|reset|forgot)/.test(pathname) ||
    pathname.startsWith("/api")
  );
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lang = detectLang(pathname);
  const hasOwnMain = pathname.startsWith("/dashboard") || pathname.startsWith("/portal");
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
        {UI_STRINGS[lang].skipToContent}
      </a>
      <MarketingShell lang={lang}>{pageContent}</MarketingShell>
      <RefConsentBanner />
      <AnalyticsConsentBanner />
    </>
  );
}
