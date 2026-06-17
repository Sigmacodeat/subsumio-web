import type { Metadata } from "next";
import ComparePage from "@/components/marketing/compare-page";
import { COMPARE } from "@/content/compare";
import { JsonLd, faqPageLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: COMPARE.de.metaTitle,
  description: COMPARE.de.metaDesc,
  alternates: { canonical: "/de/compare", languages: { en: "/compare", de: "/de/compare" } },
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqPageLd(COMPARE.de.faq)} />
      <ComparePage lang="de" />
    </>
  );
}
