import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Über Subsumio — KI-Kanzleisoftware aus Österreich",
  description:
    "Subsumio wird in Österreich für Kanzleien in AT, DE und CH gebaut. Unsere Mission: belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur — EU-Cloud oder On-Premise. Kein Training mit Mandantendaten.",
  alternates: {
    canonical: "/at/about",
    languages: {
      "de-DE": "/about",
      "de-AT": "/at/about",
      "de-CH": "/ch/about",
      en: "/en/about",
      "x-default": "/about",
    },
  },
  openGraph: {
    title: "Über Subsumio — KI-Kanzleisoftware aus Österreich",
    description:
      "Subsumio wird in Österreich für Kanzleien in AT, DE und CH gebaut. Belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur — EU-Cloud oder On-Premise.",
    url: "/at/about",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Über uns", url: "/at/about" },
        ])}
      />
      <AboutPage lang="at" />
    </>
  );
}
