import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich | AT · DE · CH",
    template: "%s — Subsumio",
  },
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in Österreich: Akten, Fristen nach ZPO/ABGB, belegte KI-Antworten. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/at",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
};

export default function ATLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div lang="de-AT">{children}</div>;
}
