import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY_DE as SECURITY } from "@/content/security-de";
import { JsonLd, organizationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.metaTitle,
  description: SECURITY.metaDesc,
  alternates: {
    canonical: "/de/security",
    languages: { "de-DE": "/de/security", "de-AT": "/at/security", "x-default": "/at/security" },
  },
  openGraph: {
    title: SECURITY.metaTitle,
    description: SECURITY.metaDesc,
    url: "/de/security",
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
          { name: "Subsumio", url: "/de" },
          { name: "Sicherheit", url: "/de/security" },
        ])}
      />
      <SecurityPage market="de" />
    </>
  );
}
