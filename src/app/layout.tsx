import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/pwa/sw-register";
import RefConsentBanner from "@/components/marketing/ref-consent";
import AnalyticsConsentBanner from "@/components/marketing/analytics-consent";
import { MonitoringProvider } from "@/components/providers/monitoring-provider";
import SubsumioTheme from "@/components/brand/subsumio-theme";
import LangSetter from "@/components/brand/lang-setter";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { QueryProvider } from "@/components/providers/query-provider";
import MarketingShell from "@/components/marketing/marketing-shell";
import type { Lang } from "@/content/site";
import "./globals.css";

export const dynamic = "force-dynamic";

// next/font self-hosts at build time — zero runtime requests to Google
// (GDPR: no visitor IP ever reaches fonts.googleapis.com) and no
// render-blocking CSS @import.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "optional" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "optional",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "optional",
});

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, EU-Cloud oder On-Premise.",
  keywords: [
    // Cluster A: Kanzleisoftware
    "Kanzleisoftware",
    "KI Kanzleisoftware",
    "cloudbasierte Kanzleisoftware",
    "Kanzleisoftware DSGVO",
    "Kanzleisoftware Österreich",
    "Kanzleisoftware Schweiz",
    "Kanzleisoftware Deutschland",
    "Anwaltssoftware",
    "Anwaltssoftware KI",
    "Kanzleisoftware selbst hosten",
    // Cluster B: Fristen
    "Fristenverwaltung Kanzlei",
    "Fristenmanagement Software",
    "Fristenberechnung ZPO",
    "Fristenberechnung BGB",
    "Fristenberechnung ABGB",
    "Fristenkontrolle Anwalt",
    // Cluster C: KI Legal
    "KI Anwaltskanzlei",
    "KI für Anwälte",
    "Legal AI Software",
    "KI Rechtsrecherche",
    "KI Schriftsatz",
    "KI Aktenverwaltung",
    "KI Dokumentenmanagement Kanzlei",
    "Legal Research AI",
    "AI legal research",
    // Cluster D: DACH-spezifisch
    "DATEV Kanzlei",
    "ADATEV",
    "beA Anbindung",
    "RVG Abrechnung Software",
    "AVV Kanzleisoftware",
    "On-Premise Kanzleisoftware",
    "Kollisionsprüfung BRAO",
    "§ 203 StGB Berufsgeheimnis",
    // Cluster E: EN
    "AI legal software",
    "self-hosted legal software",
    "GDPR legal software",
    "cited AI answers",
    "law firm software Europe",
    "legal AI DACH",
    "law firm deadline tracking",
    // Brand
    "Subsumio",
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu"),
  alternates: {
    canonical: "/",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für DACH-Rechtsanwälte",
    description:
      "Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export und Kollisionsprüfung für Kanzleien in AT, DE und CH.",
    type: "website",
    siteName: "Subsumio",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in AT, DE und CH",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — KI-Kanzleisoftware für DACH-Rechtsanwälte",
    description:
      "KI-Kanzleisoftware für Rechtsanwälte in AT, DE und CH: Akten, Fristen, belegte KI-Antworten, DATEV-Export, Kollisionsprüfung.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Subsumio",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#06060f" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";
  const lang: Lang = pathname.startsWith("/en")
    ? "en"
    : pathname.startsWith("/at")
      ? "at"
      : pathname.startsWith("/ch")
        ? "ch"
        : "de";
  // Dashboard and portal render their own <main> landmark; wrap other routes here.
  const hasOwnMain = pathname.startsWith("/dashboard") || pathname.startsWith("/portal");

  // Marketing pages get the shared shell (nav, background, footer) so the
  // header persists across client-side navigations instead of remounting.
  const isMarketingPage =
    !hasOwnMain &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/signup") &&
    !pathname.startsWith("/reset") &&
    !pathname.startsWith("/forgot") &&
    !pathname.startsWith("/en/login") &&
    !pathname.startsWith("/en/signup") &&
    !pathname.startsWith("/en/reset") &&
    !pathname.startsWith("/en/forgot") &&
    !pathname.startsWith("/api");

  const pageContent = hasOwnMain ? children : <main role="main">{children}</main>;

  return (
    <html
      lang={lang}
      className={`h-full ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={{ colorScheme: "light dark" }}
      suppressHydrationWarning
    >
      <head>
        <meta httpEquiv="content-language" content="de-DE, de-AT, de-CH, en" />
      </head>
      <body
        className="noise min-h-full [color:var(--color-light-text)] antialiased [background:var(--color-light-bg)]"
        suppressHydrationWarning
      >
        <LangSetter />
        <SubsumioTheme />
        <QueryProvider>
          <MonitoringProvider>
            <ToastProvider>
              <ConfirmProvider>
                {isMarketingPage ? (
                  <MarketingShell lang={lang}>{pageContent}</MarketingShell>
                ) : (
                  pageContent
                )}
              </ConfirmProvider>
            </ToastProvider>
          </MonitoringProvider>
        </QueryProvider>
        {isMarketingPage && <RefConsentBanner />}
        {isMarketingPage && <AnalyticsConsentBanner />}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
