import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Datenschutz",
  description:
    "Wie Subsumio mit Daten umgeht: DSGVO-Konformität, Verschlüsselung, EU-Datenhoheit und eure Rechte.",
  alternates: {
    canonical: "/ch/privacy",
    languages: {
      "de-DE": "/privacy",
      "de-AT": "/at/privacy",
      "de-CH": "/ch/privacy",
      en: "/en/privacy",
    },
  },
  openGraph: {
    title: "Datenschutz — Subsumio",
    description:
      "Wie Subsumio mit Daten umgeht: DSGVO-Konformität, Verschlüsselung, EU-Datenhoheit und eure Rechte.",
    url: "/ch/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <PrivacyContent home="/ch" lang="ch" />;
}
