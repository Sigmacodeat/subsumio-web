import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: FEATURES_PAGE.de.metaTitle,
  description: FEATURES_PAGE.de.metaDesc,
  alternates: {
    canonical: "/features",
    languages: {
      "de-DE": "/features",
      "de-AT": "/at/features",
      "de-CH": "/ch/features",
      en: "/en/features",
    },
  },
  openGraph: {
    title: FEATURES_PAGE.de.metaTitle,
    description: FEATURES_PAGE.de.metaDesc,
    url: "/de/features",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(FEATURES_PAGE.de.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Features", url: "/de/features" },
        ])}
      />
      <FeaturesPage lang="de" />
    </>
  );
}
