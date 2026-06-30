import type { Metadata } from "next";
import SuperbrainPage from "@/components/marketing/superbrain-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "SuperBrain — Die KI-Engine hinter Subsumio",
  description:
    "Das Subsumio SuperBrain: 25 Dream-Cycle-Phasen, 5 Korrektur-Ebenen, LEXam-validiert, 119 Sprachen. Eine lernende Wissensbasis für deine Kanzlei — mit belegten Antworten und nächtlicher Widerspruchsprüfung.",
  alternates: {
    canonical: "/ch/superbrain",
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
    url: "/ch/superbrain",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/ch" },
          { name: "SuperBrain", url: "/ch/superbrain" },
        ])}
      />
      <SuperbrainPage lang="ch" />
    </>
  );
}
