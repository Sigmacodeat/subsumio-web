import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Datenschutz",
  description: "Wie Subsumio mit Daten umgeht: DSGVO-Konformität, Verschlüsselung, EU-Datenhoheit und eure Rechte.",
  alternates: { canonical: "/de/privacy", languages: { en: "/privacy", de: "/de/privacy" } },
};

export default function PrivacyPage() {
  return <PrivacyContent home="/de" />;
}
