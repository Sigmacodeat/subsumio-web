import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, organizationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.metaTitle,
  description: SECURITY.metaDesc,
  alternates: {
    canonical: "/at/security",
    languages: { "de-AT": "/at/security", "de-DE": "/de/security", "x-default": "/at/security" },
  },
  openGraph: {
    title: SECURITY.metaTitle,
    description: SECURITY.metaDesc,
    url: "/at/security",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={faqPageLd(SECURITY.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Sicherheit", url: "/at/security" },
        ])}
      />
      <SecurityPage />
    </>
  );
}
