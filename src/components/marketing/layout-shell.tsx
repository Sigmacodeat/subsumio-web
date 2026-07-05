"use client";

import { usePathname } from "next/navigation";
import MarketingShell from "./marketing-shell";
import RefConsentBanner from "./ref-consent";
import AnalyticsConsentBanner from "./analytics-consent";
import type { Lang } from "@/content/site";

function detectLang(pathname: string): Lang {
  if (pathname.startsWith("/en")) return "en";
  if (pathname.startsWith("/at")) return "at";
  if (pathname.startsWith("/ch")) return "ch";
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
    pathname.startsWith("/en/login") ||
    pathname.startsWith("/en/signup") ||
    pathname.startsWith("/en/reset") ||
    pathname.startsWith("/en/forgot") ||
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
        {lang === "en" ? "Skip to content" : "Zum Inhalt springen"}
      </a>
      <MarketingShell lang={lang}>{pageContent}</MarketingShell>
      <RefConsentBanner />
      <AnalyticsConsentBanner />
    </>
  );
}
