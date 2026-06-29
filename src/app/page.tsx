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
    "KI-Kanzleisoftware für Anwälte in AT, DE & CH: Akten, Fristen nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform.",
  alternates: {
    canonical: "/",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für AT · DE · CH",
    description:
      "Aktenverwaltung, Fristenkontrolle und belegte KI-Antworten für Kanzleien in Österreich, Deutschland und der Schweiz. DSGVO-konform, EU-Cloud oder On-Premise. Jede Antwort mit Fundstelle.",
    url: "/",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={localBusinessLd()} />
      {/* AggregateRating/Review schema only when REAL testimonials exist —
          fabricated reviews are a Google manual-action + UWG risk. */}
      {TESTIMONIALS.length > 0 && (
        <JsonLd
          data={aggregateRatingLd({
            ratingValue: 5,
            reviewCount: TESTIMONIALS.length,
            reviews: TESTIMONIALS.map((t) =>
              reviewLd({ author: t.author, rating: t.rating, body: t.quote, date: t.date })
            ),
          })}
        />
      )}
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(LANDING.de.faq)} />
      <JsonLd data={howToLd(LANDING.de.how, "de")} />
      {/* VideoObject schema removed: no real demo video exists yet.
          Re-add via videoObjectLd once a real video is published. */}
      <LandingPage lang="de" />
    </>
  );
}
