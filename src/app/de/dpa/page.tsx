import type { Metadata } from "next";
import { DpaContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Auftragsverarbeitungsvertrag (AVV)",
  description:
    "AVV-Vorlage nach Art. 28 DSGVO für Kunden der gehosteten Subsumio-Cloud — Pflicht vor der Verarbeitung personenbezogener Daten.",
  alternates: {
    canonical: "/de/dpa",
    languages: { "de-DE": "/de/dpa", "de-AT": "/at/dpa", "x-default": "/at/dpa" },
  },
  openGraph: {
    title: "Auftragsverarbeitungsvertrag (AVV) — Subsumio",
    description: "AVV-Vorlage nach Art. 28 DSGVO für Kunden der gehosteten Subsumio-Cloud.",
    url: "/de/dpa",
    type: "website",
  },
};

export default function DpaPage() {
  return <DpaContent home="/de" />;
}
