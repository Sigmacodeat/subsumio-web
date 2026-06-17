import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import RefConsentBanner from "@/components/marketing/ref-consent";
import SubsumioTheme from "@/components/brand/subsumio-theme";
import "./globals.css";

// next/font self-hosts at build time — zero runtime requests to Google
// (GDPR: no visitor IP ever reaches fonts.googleapis.com) and no
// render-blocking CSS @import.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Subsumio — AI case management for law firms in Austria & Germany",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio is the AI legal software for lawyers: manage case files & documents, automate deadlines per ZPO/BGB/ABGB, get AI analysis with citations — GDPR-compliant, EU-hosted or self-hosted.",
  keywords: [
    "Subsumio",
    "AI case management",
    "legal software",
    "law firm software",
    "Anwaltssoftware",
    "Kanzleisoftware",
    "AI legal analysis",
    "GDPR compliant legal AI",
    "EU hosted legal software",
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.io"),
  openGraph: {
    title: "Subsumio — AI case management for law firms",
    description:
      "Manage case files, automate deadlines, get AI legal analysis with citations. GDPR-compliant, EU-hosted or self-hosted.",
    type: "website",
    siteName: "Subsumio",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Subsumio — AI case management for law firms" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — AI case management for law firms",
    description: "Manage case files, automate deadlines, get AI legal analysis with citations.",
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
  themeColor: "#06060f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`} style={{ colorScheme: "dark" }}>
      <body className="min-h-full bg-[#06060f] text-[#e8e8f0] antialiased noise">
        <SubsumioTheme />
        {children}
        <RefConsentBanner />
      </body>
    </html>
  );
}
