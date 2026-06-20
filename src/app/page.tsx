import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import { JsonLd, organizationLd, softwareApplicationLd, faqPageLd } from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — AI legal software for law firms",
  description:
    "AI legal software that turns matters, deadlines, emails and documents into cited answers. Self-hosted or EU cloud, built for DACH law firms.",
  alternates: { canonical: "/", languages: { en: "/", de: "/de" } },
  openGraph: {
    title: "Subsumio — AI legal software for law firms",
    description:
      "AI legal software that turns matters, deadlines, emails and documents into cited answers. Self-hosted or EU cloud.",
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
