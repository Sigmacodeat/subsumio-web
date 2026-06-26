import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Subsumio handles data: GDPR compliance, encryption, EU data residency, and your rights.",
  alternates: { canonical: "/privacy", languages: { en: "/privacy", de: "/de/privacy" } },
  openGraph: {
    title: "Privacy Policy — Subsumio",
    description: "How Subsumio handles data: GDPR compliance, encryption, EU data residency, and your rights.",
    url: "/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <PrivacyContent home="/" lang="en" />;
}
