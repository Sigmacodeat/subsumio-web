import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in der Schweiz | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in der Schweiz: Akten, Fristen nach ZPO/OR/ZGB, belegte KI-Antworten. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/ch",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
};

export default function CHLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div lang="de-CH">{children}</div>;
}
