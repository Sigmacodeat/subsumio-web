import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd, howToLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für Anwälte in AT · DE · CH",
  description:
    "KI-Kanzleisoftware für Aktenverwaltung, Fristenkontrolle, DATEV-Export und belegte KI-Antworten mit Fundstellen. DSGVO-konform, EU-Cloud oder On-Premise. Keine KI-Halluzination — jede Antwort mit Quellenangabe.",
  alternates: { canonical: "/de", languages: { en: "/", de: "/de" } },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Anwälte in AT · DE · CH",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Österreich, Deutschland und der Schweiz. DSGVO-konform, EU-Cloud oder On-Premise.",
    url: "/de",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(LANDING.de.faq)} />
      <JsonLd data={howToLd(LANDING.de.how, "de")} />
      <LandingPage lang="de" />
    </>
  );
}
