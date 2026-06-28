import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: FEATURES_PAGE.at.metaTitle,
  description: FEATURES_PAGE.at.metaDesc,
  alternates: {
    canonical: "/at/features",
    languages: {
      "de-DE": "/features",
      "de-AT": "/at/features",
      "de-CH": "/ch/features",
      en: "/en/features",
    },
  },
  openGraph: {
    title: FEATURES_PAGE.at.metaTitle,
    description: FEATURES_PAGE.at.metaDesc,
    url: "/at/features",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("at")} />
      <FeaturesPage lang="at" />
    </>
  );
}
