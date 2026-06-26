import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd, howToLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — AI Legal Software for Law Firms | AT · DE · CH",
  description:
    "AI legal software for DACH law firms: matter management, deadline tracking, cited AI answers, DATEV export. GDPR-ready, EU cloud or self-hosted. Every answer cites its source — no hallucinations.",
  alternates: { canonical: "/", languages: { en: "/", de: "/de" } },
  openGraph: {
    title: "Subsumio — AI Legal Software for Law Firms | AT · DE · CH",
    description:
      "Matter management, deadline tracking and cited AI answers for law firms in Austria, Germany and Switzerland. GDPR-ready, EU cloud or on-premise.",
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
      <JsonLd data={howToLd(LANDING.en.how, "en")} />
      <LandingPage lang="en" />
    </>
  );
}
