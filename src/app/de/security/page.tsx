import type { Metadata } from "next";
import SecurityPage from "@/components/marketing/security-page";
import { SECURITY } from "@/content/security";
import { JsonLd, faqPageLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: SECURITY.de.metaTitle,
  description: SECURITY.de.metaDesc,
  alternates: { canonical: "/de/security", languages: { en: "/security", de: "/de/security" } },
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
      <JsonLd data={faqPageLd(SECURITY.de.faq)} />
      <SecurityPage lang="de" />
    </>
  );
}
