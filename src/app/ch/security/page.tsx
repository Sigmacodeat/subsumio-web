import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, organizationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";

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
      <JsonLd data={organizationLd()} />
      <JsonLd data={faqPageLd(SECURITY.ch.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/ch" },
          { name: "Sicherheit", url: "/ch/security" },
        ])}
      />
      <SecurityPage lang="ch" />
    </>
  );
}
