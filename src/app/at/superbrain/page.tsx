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
    "Das Subsumio SuperBrain führt Ihre Dokumente zu Kanzleiwissen zusammen: Widerspruchsprüfung nach dem Hochladen, Judikatur-Wächter jede Nacht, Akten-Scan auf Abruf mit Kostenvorschau – Antworten mit Fundstellen. EU-Hosting, österreichisches Recht aus dem RIS.",
  keywords: keywordsFor("superbrain"),
  alternates: {
    canonical: "/at/superbrain",
    languages: {
      "de-AT": "/at/superbrain",
      "de-DE": "/de/superbrain",
      "x-default": "/at/superbrain",
    },
  },
  openGraph: {
    title: "SuperBrain – das Gedächtnis Ihrer Kanzlei",
    description:
      "Widerspruchsprüfung nach dem Hochladen, Judikatur-Wächter jede Nacht, Akten-Scan auf Abruf – mit Fundstellen.",
    url: "/at/superbrain",
    type: "website",
    siteName: "Subsumio",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuperBrain – das Gedächtnis Ihrer Kanzlei",
    description:
      "Widerspruchsprüfung, Judikatur-Wächter und Antworten mit Fundstellen, EU-Hosting.",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqPageLd(superbrainFaq())} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "SuperBrain", url: "/at/superbrain" },
        ])}
      />
      <SuperbrainPage />
    </>
  );
}
