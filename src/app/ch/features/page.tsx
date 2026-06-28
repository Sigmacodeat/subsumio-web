import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: FEATURES_PAGE.ch.metaTitle,
  description: FEATURES_PAGE.ch.metaDesc,
  alternates: {
    canonical: "/ch/features",
    languages: {
      "de-DE": "/features",
      "de-AT": "/at/features",
      "de-CH": "/ch/features",
      en: "/en/features",
    },
  },
  openGraph: {
    title: FEATURES_PAGE.ch.metaTitle,
    description: FEATURES_PAGE.ch.metaDesc,
    url: "/ch/features",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("ch")} />
      <JsonLd data={faqPageLd(FEATURES_PAGE.ch.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/ch" },
          { name: "Features", url: "/ch/features" },
        ])}
      />
      <FeaturesPage lang="ch" />
    </>
  );
}
