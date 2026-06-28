import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Über Subsumio — KI-Kanzleisoftware aus Österreich",
  description:
    "Subsumio wird in Österreich für Kanzleien in AT, DE und CH gebaut. Unsere Mission: belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur — EU-Cloud oder On-Premise. Kein Training mit Mandantendaten.",
  keywords: keywordsFor("about"),
  alternates: { canonical: "/about", languages: { de: "/about", en: "/en/about" } },
  openGraph: {
    title: "Über Subsumio — KI-Kanzleisoftware aus Österreich",
    description:
      "Subsumio wird in Österreich für Kanzleien in AT, DE und CH gebaut. Belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur — EU-Cloud oder On-Premise.",
    url: "/about",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Über uns", url: "/about" },
        ])}
      />
      <AboutPage lang="de" />
    </>
  );
}
