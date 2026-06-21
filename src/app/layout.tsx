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
import "./globals.css";

// next/font self-hosts at build time — zero runtime requests to Google
// (GDPR: no visitor IP ever reaches fonts.googleapis.com) and no
// render-blocking CSS @import.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Subsumio — AI Legal Workspace for DACH Law Firms",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio is legal software for matters, deadlines, documents, research and cited AI answers — built for law firms in Austria, Germany and Switzerland.",
  keywords: [
    "Subsumio",
    "Legal Software",
    "Kanzleisoftware",
    "Legal AI",
    "Fristenmanagement",
    "Aktenverwaltung",
    "Legal Research",
    "Dokumentenmanagement",
    "Subsumio",
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu"),
  openGraph: {
    title: "Subsumio — AI Legal Workspace for DACH Law Firms",
    description:
      "Matter management, deadlines, document vault, legal research and cited AI answers for law firms.",
    type: "website",
    siteName: "Subsumio",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Subsumio — AI Legal Workspace for DACH Law Firms",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — AI Legal Workspace for DACH Law Firms",
    description: "Legal software for matters, deadlines, documents and cited AI answers.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
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
  themeColor: "#eef0f4",
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
  const lang = pathname.startsWith("/de") ? "de" : "en";
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
    !pathname.startsWith("/api");

  const pageContent = hasOwnMain ? children : <main role="main">{children}</main>;

  return (
    <html
      lang={lang}
      className={`h-full ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={{ colorScheme: "light dark" }}
    >
      <body className="noise min-h-full [color:var(--color-light-text)] antialiased [background:var(--color-light-bg)]">
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
