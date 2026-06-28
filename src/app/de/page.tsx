import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import {
  JsonLd,
  organizationLd,
  softwareApplicationLd,
  faqPageLd,
  howToLd,
  localBusinessLd,
  reviewLd,
  aggregateRatingLd,
} from "@/components/seo/jsonld";
import { TESTIMONIALS } from "@/components/marketing/testimonials-data";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für AT · DE · CH",
  description:
    "KI-Kanzleisoftware für Kanzleien in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: {
    canonical: "/",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für AT · DE · CH",
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
      <JsonLd data={localBusinessLd()} />
      <JsonLd
        data={aggregateRatingLd({
          ratingValue: 5,
          reviewCount: TESTIMONIALS.length,
          reviews: TESTIMONIALS.map((t) =>
            reviewLd({ author: t.author, rating: t.rating, body: t.quote, date: t.date })
          ),
        })}
      />
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(LANDING.de.faq)} />
      <JsonLd data={howToLd(LANDING.de.how, "de")} />
      <LandingPage lang="de" />
    </>
  );
}
