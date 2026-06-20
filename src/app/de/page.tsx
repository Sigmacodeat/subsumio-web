import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — das Gedächtnis deiner Firma",
  description:
    "Jedes Meeting, jeder Deal, jede Mail, jedes Dokument — als eine Antwort statt zehn Suchtreffern. Self-hosted oder EU-Cloud, auf Open-Source-Engine.",
  alternates: { canonical: "/de", languages: { en: "/", de: "/de" } },
  openGraph: {
    title: "Subsumio — das Gedächtnis deiner Firma",
    description: "Jedes Meeting, jeder Deal, jede Mail, jedes Dokument — eine Antwort statt zehn Suchtreffern. Self-hosted oder EU-Cloud.",
    url: "/de",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(LANDING.de.faq)} />
      <LandingPage lang="de" />
    </>
  );
}
