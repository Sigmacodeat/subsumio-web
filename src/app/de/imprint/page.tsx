import type { Metadata } from "next";
import { ImprintContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Impressum und Betreiberinformationen für Subsumio — der AI Legal Workspace für Kanzleien in DACH.",
  alternates: { canonical: "/de/imprint", languages: { en: "/imprint", de: "/de/imprint" } },
};

export default function ImprintPage() {
  return <ImprintContent home="/de" />;
}
