import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Space_Grotesk, JetBrains_Mono, Fraunces } from "next/font/google";
import ServiceWorkerRegister from "@/components/pwa/sw-register";
import AppUpdateBanner from "@/components/pwa/app-update-banner";
import { MonitoringProvider } from "@/components/providers/monitoring-provider";
import SubsumioTheme from "@/components/brand/subsumio-theme";
import LangSetter from "@/components/brand/lang-setter";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { QueryProvider } from "@/components/providers/query-provider";
import { CspNonceProvider } from "@/components/providers/csp-nonce";
import LayoutShell from "@/components/marketing/layout-shell";
import "./globals.css";

// next/font self-hosts at build time — zero runtime requests to Google
// (GDPR: no visitor IP ever reaches fonts.googleapis.com) and no
// render-blocking CSS @import.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "optional",
  preload: true,
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "optional",
  preload: true,
});
// Brand serif — wordmark only (logo lockup). Never used for UI text.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-brand",
  display: "swap",
  preload: true,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "optional",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich",
    template: "%s — Subsumio",
  },
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in Österreich: Akten, Fristen nach ZPO und ABGB sowie belegte KI-Antworten mit Fundstellen.",
  keywords: [
    // Cluster A: Kanzleisoftware (high-volume transactional)
    "Kanzleisoftware",
    "KI Kanzleisoftware",
    "KI Anwaltssoftware",
    "Anwaltssoftware",
    "Anwaltssoftware KI",
    "cloudbasierte Kanzleisoftware",
    "Kanzleisoftware Vergleich",
    "Kanzleisoftware DSGVO",
    "Kanzleisoftware Österreich",
    "Kanzleisoftware selbst hosten",
    "Software für Rechtsanwälte",
    "Kanzleimanagement Software",
    // Cluster B: Fristen (problem keywords)
    "Fristenverwaltung Kanzlei",
    "Fristenmanagement Software",
    "Fristenberechnung ZPO",
    "Fristenberechnung ABGB",
    "Fristenkontrolle Anwalt",
    // Cluster C: KI Legal (informational + transactional)
    "KI Anwaltskanzlei",
    "KI für Anwälte",
    "Legal AI Software",
    "Legal Tech",
    "Kanzlei-Digitalisierung",
    "KI Rechtsrecherche",
    "KI Schriftsatz",
    "KI Aktenverwaltung",
    "KI Dokumentenmanagement Kanzlei",
    "Legal Research AI",
    "AI legal research",
    // Cluster D: Österreich-spezifisch (compliance + integration)
    "Buchhaltung",
    "webERV Anbindung",
    "RATG Abrechnung Software",
    "Honorarrechnung Software",
    "AVV Kanzleisoftware",
    "On-Premise Kanzleisoftware",
    "Kollisionsprüfung RAO",
    "§ 9 Abs. 2 RAO Verschwiegenheit",
    // Brand
    "Subsumio",
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.io"),
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Österreich",
    description:
      "Aktenverwaltung, österreichische Fristen und belegte KI-Antworten für Rechtsanwälte in Österreich. DSGVO-konform, EU-Cloud oder On-Premise.",
    type: "website",
    siteName: "Subsumio",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — KI-Kanzleisoftware für Österreich",
    description:
      "Akten, Fristen nach ZPO und ABGB, belegte KI-Antworten und österreichische Kanzleiabläufe.",
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
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="de-AT"
      className={`h-full ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}
      style={{ colorScheme: "light dark" }}
      suppressHydrationWarning
    >
      <head>
        <meta httpEquiv="content-language" content="de-AT" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Subsumio Blog — KI-Kanzleisoftware Praxiswissen"
          href="/feed.xml"
        />
      </head>
      <body
        className="noise min-h-full [color:var(--color-light-text)] antialiased [background:var(--color-light-bg)]"
        suppressHydrationWarning
      >
        <LangSetter />
        <SubsumioTheme />
        <CspNonceProvider nonce={nonce}>
          <QueryProvider>
            <MonitoringProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <LayoutShell>{children}</LayoutShell>
                </ConfirmProvider>
              </ToastProvider>
            </MonitoringProvider>
          </QueryProvider>
        </CspNonceProvider>
        <ServiceWorkerRegister />
        <AppUpdateBanner />
        <noscript>
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "12px 16px",
              background: "#303f88",
              color: "#fff",
              fontSize: "14px",
              textAlign: "center",
              zIndex: 9999,
            }}
          >
            {
              "JavaScript ist deaktiviert — einige Funktionen sind möglicherweise nicht verfügbar. Der Inhalt ist weiterhin lesbar."
            }
          </div>
        </noscript>
      </body>
    </html>
  );
}
