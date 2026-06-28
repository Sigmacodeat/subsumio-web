import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, faqPageLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.at.metaTitle,
  description: SECURITY.at.metaDesc,
  alternates: {
    canonical: "/at/security",
    languages: {
      "de-DE": "/security",
      "de-AT": "/at/security",
      "de-CH": "/ch/security",
      en: "/en/security",
    },
  },
  openGraph: {
    title: SECURITY.at.metaTitle,
    description: SECURITY.at.metaDesc,
    url: "/at/security",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqPageLd(SECURITY.at.faq)} />
      <SecurityPage lang="at" />
    </>
  );
}
