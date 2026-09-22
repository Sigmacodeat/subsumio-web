import type { Metadata } from "next";
import { MarketProvider } from "@/lib/use-market";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Deutschland",
    template: "%s — Subsumio",
  },
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in Deutschland: Akten, Fristen nach ZPO/BGB, belegte KI-Antworten. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/de",
    languages: { "de-DE": "/de", "de-AT": "/at", "x-default": "/at" },
  },
};

export default function DELayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div lang="de-DE">
      <MarketProvider market="de">{children}</MarketProvider>
    </div>
  );
}
