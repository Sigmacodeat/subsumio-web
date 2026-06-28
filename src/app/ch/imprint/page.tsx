import type { Metadata } from "next";
import { ImprintContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Impressum",
  description:
    "Impressum und Betreiberinformationen für Subsumio — der AI Legal Workspace für Kanzleien in DACH.",
  alternates: {
    canonical: "/ch/imprint",
    languages: {
      "de-DE": "/imprint",
      "de-AT": "/at/imprint",
      "de-CH": "/ch/imprint",
      en: "/en/imprint",
    },
  },
  openGraph: {
    title: "Impressum — Subsumio",
    description:
      "Impressum und Betreiberinformationen für Subsumio — der AI Legal Workspace für Kanzleien in DACH.",
    url: "/ch/imprint",
    type: "website",
  },
};

export default function ImprintPage() {
  return <ImprintContent home="/ch" lang="ch" />;
}
