import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";

export const metadata: Metadata = {
  title: "Subsumio Handbuch — Kanzleisoftware Funktionen",
  description:
    "Vollständige Feature-Dokumentation — 72 API-Endpunkte, 57 Dashboard-Seiten, 10 Kategorien. Brain, Akten, Fristen, Rechnung, Sicherheit, Mobile. Direkt aus dem Quellcode.",
  alternates: { canonical: "/de/docs", languages: { en: "/docs", de: "/de/docs" } },
};

export default function Page() {
  return <DocsPage lang="de" />;
}
