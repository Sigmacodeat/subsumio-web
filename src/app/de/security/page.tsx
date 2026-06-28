import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, organizationLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.de.metaTitle,
  description: SECURITY.de.metaDesc,
  alternates: {
    canonical: "/security",
    languages: {
      "de-DE": "/security",
      "de-AT": "/at/security",
      "de-CH": "/ch/security",
      en: "/en/security",
    },
  },
  openGraph: {
    title: SECURITY.de.metaTitle,
    description: SECURITY.de.metaDesc,
    url: "/de/security",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={faqPageLd(SECURITY.de.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Sicherheit", url: "/de/security" },
        ])}
      />
      <SecurityPage lang="de" />
    </>
  );
}
