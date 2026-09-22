import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "AGB",
  description:
    "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
  alternates: {
    canonical: "/at/terms",
    languages: { "de-AT": "/at/terms", "de-DE": "/de/terms", "x-default": "/at/terms" },
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
  return <TermsContent home="/at" />;
}
