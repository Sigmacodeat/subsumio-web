import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, faqPageLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: SECURITY.de.metaTitle,
  description: SECURITY.de.metaDesc,
  keywords: keywordsFor("security"),
  alternates: { canonical: "/security", languages: { de: "/security", en: "/en/security" } },
  openGraph: {
    title: SECURITY.de.metaTitle,
    description: SECURITY.de.metaDesc,
    url: "/security",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqPageLd(SECURITY.de.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Sicherheit", url: "/security" },
        ])}
      />
      <SecurityPage lang="de" />
    </>
  );
}
