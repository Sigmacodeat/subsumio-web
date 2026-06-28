import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";
import { JsonLd, breadcrumbLd, apiReferenceLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Handbuch — KI-Kanzleisoftware Funktionen",
  description:
    "Produkt-Handbuch für Subsumio: Akten, Fristen, Dokumente, belegte KI-Antworten, Sicherheit, Integrationen und die Dashboard-Workflows dahinter.",
  alternates: { canonical: "/docs", languages: { de: "/docs", en: "/en/docs" } },
  openGraph: {
    title: "Subsumio Handbuch — KI-Kanzleisoftware Funktionen",
    description:
      "Produkt-Handbuch für Subsumio: Akten, Fristen, Dokumente, belegte KI-Antworten, Sicherheit, Integrationen und die Dashboard-Workflows dahinter.",
    url: "/docs",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={apiReferenceLd({
          name: "Subsumio API — REST Endpoints",
          description:
            "REST API für KI-Kanzleisoftware: Aktenverwaltung, Fristenkontrolle, KI-Anfragen mit Fundstellen, Dokumenten-Upload, DATEV-Export.",
          url: "/docs",
          endpoints: [
            {
              name: "Matters",
              description: "Akten verwalten — CRUD",
              method: "GET/POST/PUT",
              path: "/api/matters",
            },
            {
              name: "Deadlines",
              description: "Fristen berechnen und abrufen",
              method: "GET/POST",
              path: "/api/deadlines",
            },
            {
              name: "AI Query",
              description: "KI-Anfrage mit Fundstellen",
              method: "POST",
              path: "/api/chat",
            },
            {
              name: "Documents",
              description: "Dokumente hochladen und indexieren",
              method: "POST/GET",
              path: "/api/documents",
            },
            {
              name: "Conflict Check",
              description: "Kollisionsprüfung für Mandanten",
              method: "POST",
              path: "/api/conflicts",
            },
          ],
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Handbuch", url: "/docs" },
        ])}
      />
      <DocsPage lang="de" />
    </>
  );
}
