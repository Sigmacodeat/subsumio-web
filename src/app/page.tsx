import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — AI legal software for DACH law firms",
  description:
    "AI legal software for matters, deadlines, documents, DATEV and cited answers. GDPR-ready, EU cloud or on-premise for DACH law firms.",
  alternates: { canonical: "/", languages: { en: "/", de: "/de" } },
  openGraph: {
    title: "Subsumio — AI legal software for DACH law firms",
    description:
      "Matters, deadlines, documents, DATEV and cited AI answers. GDPR-ready, EU cloud or on-premise.",
    url: "/",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd("en")} />
      <JsonLd data={faqPageLd(LANDING.en.faq)} />
      <LandingPage lang="en" />
    </>
  );
}
