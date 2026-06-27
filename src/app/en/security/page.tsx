import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, faqPageLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.en.metaTitle,
  description: SECURITY.en.metaDesc,
  alternates: { canonical: "/en/security", languages: { de: "/security", en: "/en/security" } },
  openGraph: {
    title: SECURITY.en.metaTitle,
    description: SECURITY.en.metaDesc,
    url: "/en/security",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqPageLd(SECURITY.en.faq)} />
      <SecurityPage lang="en" />
    </>
  );
}
