import type { Metadata } from "next";
import { ImprintContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Impressum",
  description:
    "Impressum und Betreiberinformationen für Subsumio — der AI Legal Workspace für Kanzleien in Österreich.",
  alternates: {
    canonical: "/at/imprint",
    languages: { "de-AT": "/at/imprint", "de-DE": "/de/imprint", "x-default": "/at/imprint" },
  },
  openGraph: {
    title: "Impressum — Subsumio",
    description:
      "Impressum und Betreiberinformationen für Subsumio — der AI Legal Workspace für Kanzleien in Österreich.",
    url: "/at/imprint",
    type: "website",
  },
};

export default function ImprintPage() {
  return <ImprintContent home="/at" />;
}
