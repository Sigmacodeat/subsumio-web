import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Österreich: Aktenverwaltung, Fristenkontrolle nach ZPO/ABGB, belegte KI-Antworten mit Fundstellen, ADATEV-Export, Kollisionsprüfung nach § 10 RAO. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/at",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en" },
  },
};

export default function ATLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div lang="de-AT">{children}</div>;
}
