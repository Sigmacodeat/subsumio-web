import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Handbuch — KI-Kanzleisoftware Funktionen",
  description:
    "Produkt-Handbuch für Subsumio: Akten, Fristen, Dokumente, belegte KI-Antworten, Sicherheit, Integrationen und die Arbeitsabläufe dahinter.",
  alternates: {
    canonical: "/at/docs",
  },
  openGraph: {
    title: "Subsumio Handbuch — KI-Kanzleisoftware Funktionen",
    description:
      "Produkt-Handbuch für Subsumio: Akten, Fristen, Dokumente, belegte KI-Antworten, Sicherheit, Integrationen und die Arbeitsabläufe dahinter.",
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
      <DocsPage />
    </>
  );
}
