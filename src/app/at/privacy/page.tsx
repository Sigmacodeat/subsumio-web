import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Datenschutz",
  description:
    "Wie Subsumio mit Daten umgeht: DSGVO-Konformität, Verschlüsselung, EU-Datenhoheit und Ihre Rechte.",
  alternates: {
    canonical: "/at/privacy",
  },
  openGraph: {
    title: "Datenschutz — Subsumio",
    description:
      "Wie Subsumio mit Daten umgeht: DSGVO-Konformität, Verschlüsselung, EU-Datenhoheit und Ihre Rechte.",
    url: "/at/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <PrivacyContent home="/at" />;
}
