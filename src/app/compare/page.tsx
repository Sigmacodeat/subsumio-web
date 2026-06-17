import type { Metadata } from "next";
import ComparePage from "@/components/marketing/compare-page";
import { COMPARE } from "@/content/compare";
import { JsonLd, faqPageLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: COMPARE.en.metaTitle,
  description: COMPARE.en.metaDesc,
  alternates: { canonical: "/compare", languages: { en: "/compare", de: "/de/compare" } },
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqPageLd(COMPARE.en.faq)} />
      <ComparePage lang="en" />
    </>
  );
}
