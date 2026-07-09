import type { Metadata } from "next";
import TaxPage from "@/components/marketing/tax-page";
import { DEFAULT_LANG } from "@/content/site";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Tax — KI-Wissensbasis für Steuerberater & Buchhaltung",
  description:
    "Die KI-Wissensbasis für Steuerberatung und Buchhaltung: Steuererklärungen, Bescheide, Fristen und Dokumente als Finanz-Graph verbunden. AO-Fristen-Engine, StBVV-Gebührenrechner, GoBD-konform.",
  alternates: {
    canonical: "/tax",
    languages: {
      "de-DE": "/tax",
      "de-AT": "/tax",
      "de-CH": "/tax",
      en: "/en/tax",
      "x-default": "/tax",
    },
  },
  openGraph: {
    title: "Subsumio Tax — KI-Wissensbasis für Steuerberater & Buchhaltung",
    description:
      "Steuererklärungen, Bescheide, Fristen und Dokumente als Finanz-Graph verbunden. AO-Fristen-Engine, GoBD-konform.",
    url: "/tax",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Subsumio Tax", url: "/tax" },
        ])}
      />
      <TaxPage lang={DEFAULT_LANG} />
    </>
  );
}
