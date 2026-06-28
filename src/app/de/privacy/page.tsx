import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Datenschutz",
  description:
    "Wie Subsumio mit Daten umgeht: DSGVO-Konformität, Verschlüsselung, EU-Datenhoheit und eure Rechte.",
  alternates: {
    canonical: "/privacy",
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
    url: "/de/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <PrivacyContent home="/de" lang="de" />;
}
