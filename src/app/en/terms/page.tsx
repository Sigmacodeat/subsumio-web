import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Terms of Service",
  description:
    "Terms of Service for Subsumio — usage rights, obligations, and limitations for the AI legal workspace.",
  alternates: {
    canonical: "/en/terms",
    languages: {
      "de-DE": "/terms",
      "de-AT": "/at/terms",
      "de-CH": "/ch/terms",
      en: "/en/terms",
      "x-default": "/terms",
    },
  },
  openGraph: {
    title: "Terms of Service — Subsumio",
    description:
      "Terms of Service for Subsumio — usage rights, obligations, and limitations for the AI legal workspace.",
    url: "/en/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return <TermsContent home="/en" lang="en" />;
}
