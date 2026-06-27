import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "AGB",
  description:
    "Allgemeine Geschäftsbedingungen für Subsumio — Nutzungsrechte, Pflichten und Haftungsbeschränkungen.",
  alternates: { canonical: "/de/terms", languages: { en: "/terms", de: "/de/terms" } },
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
