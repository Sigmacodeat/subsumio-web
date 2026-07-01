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
  title: "SuperBrain — The AI Engine Behind Subsumio | Legal AI with 5-Layer Architecture",
  description:
    "The Subsumio SuperBrain: 25 Dream Cycle phases, 5 correction layers, LEXam-validated, 119 languages. A learning knowledge base for your firm — with cited answers, nightly contradiction probing and DACH law fine-tuning.",
  keywords: keywordsFor("superbrain"),
  alternates: {
    canonical: "/en/superbrain",
    languages: {
      "de-DE": "/superbrain",
      "de-AT": "/at/superbrain",
      "de-CH": "/ch/superbrain",
      en: "/en/superbrain",
      "x-default": "/superbrain",
    },
  },
  openGraph: {
    title: "SuperBrain — The AI Engine Behind Subsumio",
    description:
      "25 Dream Cycle phases, 5 correction layers, LEXam-validated, 119 languages. A learning knowledge base for your firm.",
    url: "/en/superbrain",
    type: "website",
    siteName: "Subsumio",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuperBrain — The AI Engine Behind Subsumio",
    description:
      "25 Dream Cycle phases, 5 correction layers, LEXam-validated, 119 languages. Legal AI with knowledge graph.",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd("en")} />
      <JsonLd data={faqPageLd(superbrainFaq("en"))} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "SuperBrain", url: "/en/superbrain" },
        ])}
      />
      <SuperbrainPage lang="en" />
    </>
  );
}
