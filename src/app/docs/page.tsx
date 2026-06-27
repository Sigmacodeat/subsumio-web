import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

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
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Handbuch", url: "/docs" },
        ])}
      />
      <DocsPage lang="de" />
    </>
  );
}
