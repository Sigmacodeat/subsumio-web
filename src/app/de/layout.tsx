import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
};

export default function DELayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div lang="de">{children}</div>;
}
