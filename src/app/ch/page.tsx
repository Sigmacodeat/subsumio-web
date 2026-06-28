import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import {
  JsonLd,
  organizationLd,
  softwareApplicationLd,
  faqPageLd,
  howToLd,
} from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für die Schweiz",
  description:
    "KI-Kanzleisoftware für Kanzleien in der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/OR/ZGB, belegte KI-Antworten mit Fundstellen, Swissdec-Export, Kollisionsprüfung nach BGFA. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/ch",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für die Schweiz",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in der Schweiz. DSGVO-konform, EU-Cloud oder On-Premise. Jede Antwort mit Fundstelle.",
    url: "/ch",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd("ch")} />
      <JsonLd data={faqPageLd(LANDING.ch.faq)} />
      <JsonLd data={howToLd(LANDING.ch.how, "ch")} />
      <LandingPage lang="ch" />
    </>
  );
}
