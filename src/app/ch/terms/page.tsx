import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "AGB",
  description:
    "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
  alternates: {
    canonical: "/ch/terms",
    languages: {
      "de-DE": "/terms",
      "de-AT": "/at/terms",
      "de-CH": "/ch/terms",
      en: "/en/terms",
      "x-default": "/terms",
    },
  },
  openGraph: {
    title: "AGB — Subsumio",
    description:
      "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
    url: "/ch/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return <TermsContent home="/ch" lang="ch" />;
}
