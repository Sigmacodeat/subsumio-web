import type { Metadata } from "next";
import { DpaContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Data Processing Agreement (DPA)",
  description:
    "DPA template per Art. 28 GDPR for customers of the hosted Subsumio cloud — required before processing personal data.",
  alternates: {
    canonical: "/en/dpa",
    languages: {
      "de-DE": "/dpa",
      "de-AT": "/at/dpa",
      "de-CH": "/ch/dpa",
      en: "/en/dpa",
    },
  },
  openGraph: {
    title: "Data Processing Agreement (DPA) — Subsumio",
    description: "DPA template per Art. 28 GDPR for customers of the hosted Subsumio cloud.",
    url: "/en/dpa",
    type: "website",
  },
};

export default function DpaPage() {
  return <DpaContent home="/en" lang="en" />;
}
