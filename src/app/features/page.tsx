import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: FEATURES_PAGE.de.metaTitle,
  description: FEATURES_PAGE.de.metaDesc,
  alternates: { canonical: "/features", languages: { de: "/features", en: "/en/features" } },
  openGraph: {
    title: FEATURES_PAGE.de.metaTitle,
    description: FEATURES_PAGE.de.metaDesc,
    url: "/features",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={softwareApplicationLd("de")} />
      <FeaturesPage lang="de" />
    </>
  );
}
