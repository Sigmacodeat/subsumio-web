import type { Metadata } from "next";
import SuperbrainPage from "@/components/marketing/superbrain-page";
import { superbrainFaq } from "@/components/marketing/superbrain-content";
import {
  JsonLd,
  organizationLd,
  breadcrumbLd,
  softwareApplicationLd,
  faqPageLd,
} from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "SuperBrain – das Gedächtnis Ihrer Kanzlei | Subsumio",
  description:
    "Das Subsumio SuperBrain prüft jede Nacht die neuen Dokumente Ihrer Kanzlei. Am Morgen sehen Sie neue Widersprüche, anstehende Fristen und fehlende Unterlagen – mit Fundstellen. EU-Hosting, deutsches Recht von gesetze-im-internet.de.",
  keywords: keywordsFor("superbrain", "de"),
  alternates: {
    canonical: "/de/superbrain",
    languages: {
      "de-DE": "/de/superbrain",
      "de-AT": "/at/superbrain",
      "x-default": "/at/superbrain",
    },
  },
  openGraph: {
    title: "SuperBrain – das Gedächtnis Ihrer Kanzlei",
    description:
      "Nächtliche Prüfung Ihrer Akten in fünf Schritten: Widersprüche, Fristen und fehlende Unterlagen liegen am Morgen in Ihrer Übersicht.",
    url: "/de/superbrain",
    type: "website",
    siteName: "Subsumio",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuperBrain – das Gedächtnis Ihrer Kanzlei",
    description:
      "Nächtliche Prüfung Ihrer Akten in fünf Schritten, Antworten mit Fundstellen, EU-Hosting.",
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
          { name: "Subsumio", url: "/de" },
          { name: "SuperBrain", url: "/de/superbrain" },
        ])}
      />
      <SuperbrainPage market="de" />
    </>
  );
}
