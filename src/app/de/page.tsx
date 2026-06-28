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
  title: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH",
  description:
    "KI-Kanzleisoftware für Kanzleien in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Österreich, Deutschland und der Schweiz. DSGVO-konform, EU-Cloud oder On-Premise. Jede Antwort mit Fundstelle.",
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
