import type { Metadata } from "next";
import { ProduktPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Produkt — das Kanzlei-Gehirn in einem System",
  description:
    "Akten, Fristen, Zeiten, Auslagen, Rechnungen und der WhatsApp-Copilot — alles auf eurer Infrastruktur, jede Antwort mit Fundstelle. Für Kanzleien gebaut.",
  alternates: { canonical: "/subsumio/produkt", languages: { en: "/subsumio/produkt", de: "/de/subsumio/produkt" } },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/subsumio" }, { name: "Product", url: "/subsumio/produkt" }])} />
      <ProduktPage lang="en" />
    </>
  );
}
