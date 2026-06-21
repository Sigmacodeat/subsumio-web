import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für DACH-Kanzleien",
  description:
    "KI-Kanzleisoftware für Akten, Fristen, Dokumente, DATEV und belegte Antworten mit Fundstellen. DSGVO-konform, EU-Cloud oder On-Premise für DACH-Kanzleien.",
  alternates: { canonical: "/de", languages: { en: "/", de: "/de" } },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für DACH-Kanzleien",
    description:
      "Akten, Fristen, Dokumente, DATEV und belegte KI-Antworten mit Fundstellen. DSGVO-konform, EU-Cloud oder On-Premise.",
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
      <LandingPage lang="de" />
    </>
  );
}
