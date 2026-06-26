import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Über Subsumio — KI-Kanzleisoftware aus Österreich für AT · DE · CH",
  description:
    "Subsumio wird in Österreich für Kanzleien in AT, DE und CH gebaut. Unsere Mission: belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur — EU-Cloud oder On-Premise.",
  alternates: { canonical: "/de/about", languages: { en: "/about", de: "/de/about" } },
  openGraph: {
    title: "Über Subsumio — KI-Kanzleisoftware aus Österreich für AT · DE · CH",
    description:
      "Subsumio wird in Österreich für Kanzleien in AT, DE und CH gebaut. Unsere Mission: belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur.",
    url: "/de/about",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/de" }, { name: "Über uns", url: "/de/about" }])} />
      <AboutPage lang="de" />
    </>
  );
}
