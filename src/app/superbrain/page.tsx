import type { Metadata } from "next";
import SuperbrainPage, { superbrainFaq } from "@/components/marketing/superbrain-page";
import {
  JsonLd,
  organizationLd,
  breadcrumbLd,
  softwareApplicationLd,
  faqPageLd,
} from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "SuperBrain — Die KI-Engine hinter Subsumio | Legal AI mit 5-Ebenen-Architektur",
  description:
    "Das Subsumio SuperBrain: 25 Dream-Cycle-Phasen, 5 Korrektur-Ebenen, LEXam-validiert, 119 Sprachen. Eine lernende Wissensbasis für deine Kanzlei — mit belegten Antworten, nächtlicher Widerspruchsprüfung und DACH-Recht Fine-Tuning.",
  keywords: keywordsFor("superbrain"),
  alternates: {
    canonical: "/superbrain",
    languages: {
      "de-DE": "/superbrain",
      "de-AT": "/at/superbrain",
      "de-CH": "/ch/superbrain",
      en: "/en/superbrain",
      "x-default": "/superbrain",
    },
  },
  openGraph: {
    title: "SuperBrain — Die KI-Engine hinter Subsumio",
    description:
      "25 Dream-Cycle-Phasen, 5 Korrektur-Ebenen, LEXam-validiert, 119 Sprachen. Eine lernende Wissensbasis für deine Kanzlei.",
    url: "/superbrain",
    type: "website",
    siteName: "Subsumio",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuperBrain — Die KI-Engine hinter Subsumio",
    description:
      "25 Dream-Cycle-Phasen, 5 Korrektur-Ebenen, LEXam-validiert, 119 Sprachen. Legal AI mit Wissensgraph.",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(superbrainFaq("de"))} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "SuperBrain", url: "/superbrain" },
        ])}
      />
      <SuperbrainPage lang="de" />
    </>
  );
}
