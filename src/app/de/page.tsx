import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import {
  JsonLd,
  organizationLd,
  softwareApplicationLd,
  faqPageLd,
  howToLd,
} from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import { contentFor } from "@/lib/market";

const LANDING = contentFor("de").landing;

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für Deutschland",
  description:
    "KI-Kanzleisoftware für Kanzleien in Deutschland: Aktenverwaltung, Fristenkontrolle, belegte KI-Antworten mit Fundstellen, Honorarverwaltung und Kollisionsprüfung nach § 43a Abs. 4 BRAO. EU-Cloud oder On-Premise.",
  keywords: keywordsFor("root", "de"),
  alternates: {
    canonical: "/de",
    languages: { "de-DE": "/de", "de-AT": "/at", "x-default": "/at" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Deutschland",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Deutschland. DSGVO-konform, EU-Cloud oder On-Premise. Jede Antwort mit Fundstelle.",
    url: "/de",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — KI-Kanzleisoftware für Deutschland",
    description:
      "Akten, Fristen nach ZPO/BGB, belegte KI-Antworten. DSGVO-konform, EU-Cloud oder On-Premise.",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd("de")} />
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(LANDING.faq)} />
      <JsonLd data={howToLd(LANDING.how)} />
      <LandingPage market="de" />
    </>
  );
}
