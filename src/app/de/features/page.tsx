import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE_DE as FEATURES_PAGE } from "@/content/features-de";
import { JsonLd, softwareApplicationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: FEATURES_PAGE.metaTitle,
  description: FEATURES_PAGE.metaDesc,
  keywords: keywordsFor("features"),
  alternates: {
    canonical: "/de/features",
    languages: { "de-DE": "/de/features", "de-AT": "/at/features", "x-default": "/at/features" },
  },
  openGraph: {
    title: FEATURES_PAGE.metaTitle,
    description: FEATURES_PAGE.metaDesc,
    url: "/de/features",
    type: "website",
    siteName: "Subsumio",
  },
  twitter: {
    card: "summary_large_image",
    title: FEATURES_PAGE.metaTitle,
    description: FEATURES_PAGE.metaDesc,
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(FEATURES_PAGE.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Features", url: "/de/features" },
        ])}
      />
      <FeaturesPage market="de" />
    </>
  );
}
