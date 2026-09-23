import type { Metadata } from "next";
import { MarketProvider } from "@/lib/use-market";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Deutschland",
    template: "%s — Subsumio",
  },
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in Deutschland: Akten, Fristen nach ZPO/BGB, belegte KI-Antworten. Nach DSGVO konzipiert, AVV inklusive; Hosting in Wien oder On-Premise.",
  keywords: [
    "Kanzleisoftware",
    "KI Kanzleisoftware",
    "Anwaltssoftware Deutschland",
    "KI Rechtsrecherche",
    "Fristenberechnung BGB",
    "beA Anbindung",
    "Kollisionsprüfung BRAO",
    "§ 43a BRAO Verschwiegenheit",
    "RVG Abrechnung Software",
    "Legal Tech Deutschland",
  ],
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Deutschland",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Deutschland. Nach DSGVO konzipiert, AVV inklusive; Hosting in Wien oder On-Premise.",
    url: "/de",
    type: "website",
    locale: "de_DE",
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — KI-Kanzleisoftware für Deutschland",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Deutschland. Nach DSGVO konzipiert, AVV inklusive.",
  },
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
