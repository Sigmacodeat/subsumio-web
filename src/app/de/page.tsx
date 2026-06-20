import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte",
  description:
    "KI-Kanzleisoftware, die Akten, Fristen, E-Mails und Dokumente in belegte Antworten verwandelt. Self-hosted oder EU-Cloud, gebaut für DACH-Kanzleien.",
  alternates: { canonical: "/de", languages: { en: "/", de: "/de" } },
  openGraph: {
    title: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte",
    description:
      "KI-Kanzleisoftware, die Akten, Fristen, E-Mails und Dokumente in belegte Antworten verwandelt. Self-hosted oder EU-Cloud.",
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
