import type { Metadata } from "next";
import { DpaContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Auftragsverarbeitungsvertrag (AVV)",
  description:
    "AVV-Vorlage nach Art. 28 DSGVO für Kunden der gehosteten Subsumio-Cloud — Pflicht vor der Verarbeitung personenbezogener Daten.",
  alternates: {
    canonical: "/ch/dpa",
    languages: {
      "de-DE": "/dpa",
      "de-AT": "/at/dpa",
      "de-CH": "/ch/dpa",
      en: "/en/dpa",
    },
  },
  openGraph: {
    title: "Auftragsverarbeitungsvertrag (AVV) — Subsumio",
    description: "AVV-Vorlage nach Art. 28 DSGVO für Kunden der gehosteten Subsumio-Cloud.",
    url: "/ch/dpa",
    type: "website",
  },
};

export default function DpaPage() {
  return <DpaContent home="/ch" lang="ch" />;
}
