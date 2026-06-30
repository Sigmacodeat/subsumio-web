import type { Metadata } from "next";
import SuperbrainPage from "@/components/marketing/superbrain-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "SuperBrain — The AI Engine Behind Subsumio",
  description:
    "The Subsumio SuperBrain: 25 Dream Cycle phases, 5 correction layers, LEXam-validated, 119 languages. A learning knowledge base for your firm — with cited answers and nightly contradiction probing.",
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
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
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
