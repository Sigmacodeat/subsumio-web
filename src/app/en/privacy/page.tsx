import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Subsumio handles data: GDPR compliance, encryption, EU data residency, and your rights.",
  alternates: {
    canonical: "/en/privacy",
    languages: {
      "de-DE": "/privacy",
      "de-AT": "/at/privacy",
      "de-CH": "/ch/privacy",
      en: "/en/privacy",
    },
  },
  openGraph: {
    title: "Privacy Policy — Subsumio",
    description:
      "How Subsumio handles data: GDPR compliance, encryption, EU data residency, and your rights.",
    url: "/en/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <PrivacyContent home="/en" lang="en" />;
}
