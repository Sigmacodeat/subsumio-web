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
  videoObjectLd,
} from "@/components/seo/jsonld";
import { TESTIMONIALS } from "@/components/marketing/testimonials-data";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für AT · DE · CH",
  description:
    "KI-Kanzleisoftware für Kanzleien in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, EU-Cloud oder On-Premise.",
  alternates: { canonical: "/", languages: { de: "/", en: "/en" } },
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
      <JsonLd
        data={videoObjectLd({
          name: "Subsumio Demo — KI-Kanzleisoftware in 90 Sekunden",
          description:
            "Kurze Produkttour: Akten hochladen, Frage stellen, belegte Antwort mit Fundstellen erhalten, Fristen automatisch berechnen.",
          thumbnailUrl: "/og-image.png",
          uploadDate: "2026-06-28",
          embedUrl: "https://www.youtube.com/embed/subsumio-demo",
          duration: "PT1M30S",
        })}
      />
      <LandingPage lang="de" />
    </>
  );
}
