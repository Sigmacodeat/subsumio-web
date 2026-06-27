import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: FEATURES_PAGE.en.metaTitle,
  description: FEATURES_PAGE.en.metaDesc,
  alternates: { canonical: "/en/features", languages: { de: "/features", en: "/en/features" } },
  openGraph: {
    title: FEATURES_PAGE.en.metaTitle,
    description: FEATURES_PAGE.en.metaDesc,
    url: "/en/features",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("en")} />
      <FeaturesPage lang="en" />
    </>
  );
}
