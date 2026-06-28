import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "AGB",
  description:
    "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
  alternates: {
    canonical: "/terms",
    languages: { "de-DE": "/terms", "de-AT": "/at/terms", "de-CH": "/ch/terms", en: "/en/terms" },
  },
  openGraph: {
    title: "AGB — Subsumio",
    description:
      "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
    url: "/de/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return <TermsContent home="/de" lang="de" />;
}
