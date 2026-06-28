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
  title: "Subsumio — KI-Kanzleisoftware für Österreich",
  description:
    "KI-Kanzleisoftware für Kanzleien in Österreich: Aktenverwaltung, Fristenkontrolle nach ZPO/ABGB, belegte KI-Antworten mit Fundstellen, ADATEV-Export, Kollisionsprüfung nach § 10 RAO. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/at",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Österreich",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Österreich. DSGVO-konform, EU-Cloud oder On-Premise. Jede Antwort mit Fundstelle.",
    url: "/at",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd("at")} />
      <JsonLd data={faqPageLd(LANDING.at.faq)} />
      <JsonLd data={howToLd(LANDING.at.how, "at")} />
      <LandingPage lang="at" />
    </>
  );
}
