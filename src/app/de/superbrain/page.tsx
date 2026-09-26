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
    "Das Subsumio SuperBrain führt Ihre Dokumente zu Kanzleiwissen zusammen: Widerspruchsprüfung nach dem Hochladen, Judikatur-Wächter jede Nacht, Akten-Scan auf Abruf mit Kostenvorschau – Antworten mit Fundstellen. EU-Hosting, deutsches Recht von gesetze-im-internet.de.",
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
      "Widerspruchsprüfung nach dem Hochladen, Judikatur-Wächter jede Nacht, Akten-Scan auf Abruf – mit Fundstellen.",
    url: "/de/superbrain",
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
      <JsonLd data={organizationLd("de")} />
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
