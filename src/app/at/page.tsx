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
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für Österreich",
  description:
    "KI-Kanzleisoftware für Kanzleien in Österreich: Aktenverwaltung, Fristenkontrolle, belegte KI-Antworten mit Fundstellen, Honorarverwaltung und Kollisionsprüfung nach § 10 RAO. EU-Cloud oder On-Premise.",
  keywords: keywordsFor("root"),
  alternates: {
    canonical: "/at",
    languages: { "de-AT": "/at", "de-DE": "/de", "x-default": "/at" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Österreich",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Österreich. DSGVO-konform, EU-Cloud oder On-Premise. Jede Antwort mit Fundstelle.",
    url: "/at",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — KI-Kanzleisoftware für Österreich",
    description:
      "Akten, Fristen nach ZPO/ABGB, belegte KI-Antworten. DSGVO-konform, EU-Cloud oder On-Premise.",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqPageLd(LANDING.faq)} />
      <JsonLd data={howToLd(LANDING.how)} />
      <LandingPage />
    </>
  );
}
