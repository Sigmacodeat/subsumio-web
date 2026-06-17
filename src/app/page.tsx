import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Sigmabrain — the brain your firm never had",
  description:
    "Every meeting, deal, email and document — turned into one answer instead of ten search results. Self-hosted or EU cloud, built on an open-source engine.",
  alternates: { canonical: "/", languages: { en: "/", de: "/de" } },
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
