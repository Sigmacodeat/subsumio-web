import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";

export const metadata: Metadata = {
  title: "Subsumio Handbuch — KI-Kanzleisoftware Funktionen",
  description:
    "Produkt-Handbuch für Subsumio: Akten, Fristen, Dokumente, belegte KI-Antworten, Sicherheit, Integrationen und die Dashboard-Workflows dahinter.",
  alternates: { canonical: "/de/docs", languages: { en: "/docs", de: "/de/docs" } },
};

export default function Page() {
  return <DocsPage lang="de" />;
}
