import type { Metadata } from "next";
import { DpaContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Auftragsverarbeitungsvertrag (AVV)",
  description:
    "AVV-Vorlage nach Art. 28 DSGVO für Kunden der gehosteten Subsumio-Cloud — Pflicht vor der Verarbeitung personenbezogener Daten.",
  alternates: {
    canonical: "/at/dpa",
    languages: { "de-AT": "/at/dpa", "de-DE": "/de/dpa", "x-default": "/at/dpa" },
  },
  openGraph: {
    title: "Auftragsverarbeitungsvertrag (AVV) — Subsumio",
    description: "AVV-Vorlage nach Art. 28 DSGVO für Kunden der gehosteten Subsumio-Cloud.",
    url: "/at/dpa",
    type: "website",
  },
};

export default function DpaPage() {
  return <DpaContent home="/at" />;
}
