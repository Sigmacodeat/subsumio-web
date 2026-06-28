import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in der Schweiz | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/OR/ZGB, belegte KI-Antworten mit Fundstellen, Swissdec-Export, Kollisionsprüfung nach BGFA. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/ch",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en" },
  },
};

export default function CHLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div lang="de-CH">{children}</div>;
}
