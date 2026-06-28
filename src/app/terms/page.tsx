import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "AGB",
  description:
    "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
  alternates: { canonical: "/terms", languages: { de: "/terms", en: "/en/terms" } },
  openGraph: {
    title: "AGB — Subsumio",
    description:
      "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
    url: "/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return <TermsContent home="/" lang="de" />;
}
