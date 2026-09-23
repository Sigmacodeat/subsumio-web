import type { Metadata } from "next";
import { MarketProvider } from "@/lib/use-market";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich",
    template: "%s — Subsumio",
  },
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in Österreich: Akten, Fristen nach ZPO/ABGB, belegte KI-Antworten. Nach DSGVO konzipiert, AVV inklusive; Hosting in Wien oder On-Premise.",
  alternates: {
    canonical: "/at",
    languages: { "de-AT": "/at", "de-DE": "/de", "x-default": "/at" },
  },
};

export default function ATLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div lang="de-AT">
      <MarketProvider market="at">{children}</MarketProvider>
    </div>
  );
}
