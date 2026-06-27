import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for Subsumio — usage rights, obligations, and limitations for the AI legal workspace.",
  alternates: { canonical: "/terms", languages: { en: "/terms", de: "/de/terms" } },
  openGraph: {
    title: "Terms of Service — Subsumio",
    description:
      "Terms of Service for Subsumio — usage rights, obligations, and limitations for the AI legal workspace.",
    url: "/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return <TermsContent home="/" lang="en" />;
}
