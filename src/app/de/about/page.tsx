import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Über Subsumio — KI-Kanzleisoftware aus Deutschland",
  description:
    "Subsumio wird in Deutschland für deutsche Kanzleien gebaut. Unsere Mission: belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur — EU-Cloud oder On-Premise. Kein Training mit Mandantendaten.",
  alternates: {
    canonical: "/de/about",
    languages: { "de-DE": "/de/about", "de-AT": "/at/about", "x-default": "/at/about" },
  },
  openGraph: {
    title: "Über Subsumio — KI-Kanzleisoftware aus Deutschland",
    description:
      "Subsumio wird in Deutschland für deutsche Kanzleien gebaut. Belegte KI-Antworten für Rechtsarbeit, mit Vertraulichkeit per Architektur — EU-Cloud oder On-Premise.",
    url: "/de/about",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Über uns", url: "/de/about" },
        ])}
      />
      <AboutPage market="de" />
    </>
  );
}
