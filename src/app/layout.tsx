import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/pwa/sw-register";
import AppUpdateBanner from "@/components/pwa/app-update-banner";
import { MonitoringProvider } from "@/components/providers/monitoring-provider";
import SubsumioTheme from "@/components/brand/subsumio-theme";
import LangSetter from "@/components/brand/lang-setter";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { QueryProvider } from "@/components/providers/query-provider";
import LayoutShell from "@/components/marketing/layout-shell";
import "./globals.css";

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
    default: "Subsumio — KI-Kanzleisoftware & Anwaltssoftware für Anwälte | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "KI-Kanzleisoftware & Anwaltssoftware für Rechtsanwälte in AT, DE & CH: Aktenverwaltung, Fristenmanagement nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, AVV, On-Premise oder EU-Cloud.",
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
    "Kanzleisoftware Schweiz",
    "Kanzleisoftware Deutschland",
    "Kanzleisoftware selbst hosten",
    "Software für Rechtsanwälte",
    "Kanzleimanagement Software",
    // Cluster B: Fristen (problem keywords)
    "Fristenverwaltung Kanzlei",
    "Fristenmanagement Software",
    "Fristenberechnung ZPO",
    "Fristenberechnung BGB",
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
    // Cluster D: DACH-spezifisch (compliance + integration)
    "DATEV Kanzlei",
    "ADATEV",
    "beA Anbindung",
    "RVG Abrechnung Software",
    "Honorarrechnung Software",
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
    title: "Subsumio — KI-Kanzleisoftware & Anwaltssoftware für DACH-Rechtsanwälte",
    description:
      "KI-Kanzleisoftware für Rechtsanwälte in AT, DE & CH: Aktenverwaltung, Fristenmanagement nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, AVV, On-Premise oder EU-Cloud.",
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
    title: "Subsumio — KI-Kanzleisoftware & Anwaltssoftware für DACH-Rechtsanwälte",
    description:
      "KI-Kanzleisoftware & Anwaltssoftware für AT, DE & CH: Akten, Fristen nach ZPO/BGB/ABGB, belegte KI-Antworten, DATEV-Export, Kollisionsprüfung, § 203 StGB-konform.",
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
      lang="de"
      className={`h-full ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={{ colorScheme: "light dark" }}
      suppressHydrationWarning
    >
      <head>
        <meta httpEquiv="content-language" content="de-DE, de-AT, de-CH, en" />
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
        {/* The nonce prop on Script triggers Next.js to inject the nonce into
            ALL inline scripts (RSC payload, boot scripts, etc.) when CSP
            strict-dynamic is used. Without this, inline scripts are blocked
            by the CSP policy set in middleware. */}
        <Script id="csp-nonce-bootstrap" nonce={nonce} strategy="beforeInteractive" />
        <LangSetter />
        <SubsumioTheme />
        <QueryProvider>
          <MonitoringProvider>
            <ToastProvider>
              <ConfirmProvider>
                <LayoutShell>{children}</LayoutShell>
              </ConfirmProvider>
            </ToastProvider>
          </MonitoringProvider>
        </QueryProvider>
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
              background: "#1e40af",
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
