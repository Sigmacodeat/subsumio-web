import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, faqPageLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.ch.metaTitle,
  description: SECURITY.ch.metaDesc,
  alternates: {
    canonical: "/ch/security",
    languages: {
      "de-DE": "/security",
      "de-AT": "/at/security",
      "de-CH": "/ch/security",
      en: "/en/security",
    },
  },
  openGraph: {
    title: SECURITY.ch.metaTitle,
    description: SECURITY.ch.metaDesc,
    url: "/ch/security",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqPageLd(SECURITY.ch.faq)} />
      <SecurityPage lang="ch" />
    </>
  );
}
