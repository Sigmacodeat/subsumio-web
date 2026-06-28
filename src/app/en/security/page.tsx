import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, organizationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.en.metaTitle,
  description: SECURITY.en.metaDesc,
  alternates: {
    canonical: "/en/security",
    languages: {
      "de-DE": "/security",
      "de-AT": "/at/security",
      "de-CH": "/ch/security",
      en: "/en/security",
    },
  },
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
      <JsonLd data={organizationLd()} />
      <JsonLd data={faqPageLd(SECURITY.en.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/en" },
          { name: "Security", url: "/en/security" },
        ])}
      />
      <SecurityPage lang="en" />
    </>
  );
}
