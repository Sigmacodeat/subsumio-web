import type { Metadata } from "next";
import { ImprintContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Impressum",
  description:
    "Impressum und Betreiberinformationen für Subsumio — der AI Legal Workspace für Kanzleien in Deutschland.",
  alternates: {
    canonical: "/de/imprint",
    languages: { "de-DE": "/de/imprint", "de-AT": "/at/imprint", "x-default": "/at/imprint" },
  },
  openGraph: {
    title: "Impressum — Subsumio",
    description:
      "Impressum und Betreiberinformationen für Subsumio — der AI Legal Workspace für Kanzleien in Deutschland.",
    url: "/de/imprint",
    type: "website",
  },
};

export default function ImprintPage() {
  return <ImprintContent home="/de" />;
}
