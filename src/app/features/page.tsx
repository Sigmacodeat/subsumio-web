import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: FEATURES_PAGE.en.metaTitle,
  description: FEATURES_PAGE.en.metaDesc,
  alternates: { canonical: "/features", languages: { en: "/features", de: "/de/features" } },
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("en")} />
      <FeaturesPage lang="en" />
    </>
  );
}
