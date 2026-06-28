import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "AGB",
  description:
    "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
  alternates: {
    canonical: "/at/terms",
    languages: { "de-DE": "/terms", "de-AT": "/at/terms", "de-CH": "/ch/terms", en: "/en/terms" },
  },
  openGraph: {
    title: "AGB — Subsumio",
    description:
      "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
    url: "/at/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return <TermsContent home="/at" lang="at" />;
}
