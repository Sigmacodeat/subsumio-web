import type { Metadata } from "next";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import { CitiesIndexPage } from "@/components/marketing/city-pages";

export const metadata: Metadata = {
  title: "KI-Kanzleisoftware Deutschland — Subsumio für Anwälte",
  description:
    "KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Deutschland: Fristen nach ZPO und BGB, belegte KI-Antworten mit Fundstellen und Verschwiegenheit nach § 43a Abs. 2 BRAO — in Berlin, München, Hamburg, Köln und Frankfurt am Main.",
  keywords: keywordsFor("cities", "de"),
  alternates: {
    canonical: "/de/cities",
    languages: { "de-DE": "/de/cities", "de-AT": "/at/cities", "x-default": "/at/cities" },
  },
  openGraph: {
    title: "KI-Kanzleisoftware Deutschland — Subsumio für Anwälte",
    description:
      "Fristen nach ZPO, belegte Antworten mit Fundstellen und Verschwiegenheit nach § 43a Abs. 2 BRAO — für Kanzleien in ganz Deutschland.",
    url: "/de/cities",
    type: "website",
  },
};

export default function CitiesPage() {
  return (
    <>
      <JsonLd data={organizationLd("de")} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Städte", url: "/de/cities" },
        ])}
      />
      <CitiesIndexPage market="de" />
    </>
  );
}
