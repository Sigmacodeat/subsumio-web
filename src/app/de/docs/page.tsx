import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";

export const metadata: Metadata = {
  title: "Handbuch — Alles was Subsumio kann",
  description: "Vollständige Feature-Dokumentation direkt aus dem Quellcode. Keine Floskeln, nur Fakten.",
  alternates: { canonical: "/de/docs", languages: { en: "/docs", de: "/de/docs" } },
};

export default function Page() {
  return <DocsPage lang="de" />;
}
