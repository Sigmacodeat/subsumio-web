import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";
import { JsonLd, softwareApplicationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: FEATURES_PAGE.de.metaTitle,
  description: FEATURES_PAGE.de.metaDesc,
  keywords: keywordsFor("features"),
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
      <JsonLd data={faqPageLd(FEATURES_PAGE.de.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Features", url: "/features" },
        ])}
      />
      <FeaturesPage lang="de" />
    </>
  );
}
