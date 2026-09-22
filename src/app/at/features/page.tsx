import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: FEATURES_PAGE.metaTitle,
  description: FEATURES_PAGE.metaDesc,
  keywords: keywordsFor("features"),
  alternates: {
    canonical: "/at/features",
    languages: { "de-AT": "/at/features", "de-DE": "/de/features", "x-default": "/at/features" },
  },
  openGraph: {
    title: FEATURES_PAGE.metaTitle,
    description: FEATURES_PAGE.metaDesc,
    url: "/at/features",
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
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqPageLd(FEATURES_PAGE.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Features", url: "/at/features" },
        ])}
      />
      <FeaturesPage />
    </>
  );
}
