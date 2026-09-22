import type { Metadata } from "next";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import { CitiesIndexPage } from "@/components/marketing/city-pages";

export const metadata: Metadata = {
  title: "KI-Kanzleisoftware Österreich — Subsumio für Anwälte",
  description:
    "KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Österreich: Fristen nach ZPO und ABGB, belegte KI-Antworten mit Fundstellen und Verschwiegenheit nach § 9 Abs. 2 RAO — in Wien, Graz, Linz, Salzburg und Innsbruck.",
  keywords: keywordsFor("cities"),
  alternates: {
    canonical: "/at/cities",
    languages: { "de-AT": "/at/cities", "de-DE": "/de/cities", "x-default": "/at/cities" },
  },
  openGraph: {
    title: "KI-Kanzleisoftware Österreich — Subsumio für Anwälte",
    description:
      "Fristen nach ZPO, belegte Antworten mit Fundstellen und Verschwiegenheit nach § 9 Abs. 2 RAO — für Kanzleien in ganz Österreich.",
    url: "/at/cities",
    type: "website",
  },
};

export default function CitiesPage() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Städte", url: "/at/cities" },
        ])}
      />
      <CitiesIndexPage />
    </>
  );
}
