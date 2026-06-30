import type { Metadata } from "next";
import LandingPage from "@/components/marketing/landing";
import {
  JsonLd,
  organizationLd,
  softwareApplicationLd,
  faqPageLd,
  howToLd,
} from "@/components/seo/jsonld";
import { LANDING } from "@/content/site";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio — AI Legal Software for Law Firms | AT · DE · CH",
  description:
    "AI legal software for DACH law firms: matter management, deadline tracking per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check. GDPR-ready, EU cloud or self-hosted.",
  keywords: keywordsFor("root"),
  alternates: {
    canonical: "/en",
    languages: { "de-DE": "/", "de-AT": "/at", "de-CH": "/ch", en: "/en", "x-default": "/" },
  },
  openGraph: {
    title: "Subsumio — AI Legal Software for Law Firms | AT · DE · CH",
    description:
      "Matter management, deadline tracking and cited AI answers for law firms in Austria, Germany and Switzerland. GDPR-ready, EU cloud or on-premise. Every answer cites its source.",
    url: "/en",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Subsumio — AI Legal Software for Law Firms | AT · DE · CH",
    description:
      "Cited AI answers, deadline tracking, conflict check. GDPR-ready, EU cloud or self-hosted.",
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
