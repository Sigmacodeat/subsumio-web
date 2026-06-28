import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Handbuch — KI-Kanzleisoftware Funktionen",
  description:
    "Produkt-Handbuch für Subsumio: Akten, Fristen, Dokumente, belegte KI-Antworten, Sicherheit, Integrationen und die Dashboard-Workflows dahinter.",
  alternates: {
    canonical: "/at/docs",
    languages: { "de-DE": "/docs", "de-AT": "/at/docs", "de-CH": "/ch/docs", en: "/en/docs" },
  },
  openGraph: {
    title: "Subsumio Handbuch — KI-Kanzleisoftware Funktionen",
    description:
      "Produkt-Handbuch für Subsumio: Akten, Fristen, Dokumente, belegte KI-Antworten, Sicherheit, Integrationen und die Dashboard-Workflows dahinter.",
    url: "/at/docs",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Handbuch", url: "/at/docs" },
        ])}
      />
      <DocsPage lang="at" />
    </>
  );
}
