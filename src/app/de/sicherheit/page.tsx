import type { Metadata } from "next";
import { SicherheitPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Sicherheit & DSGVO — Vertraulichkeit durch Architektur",
  description:
    "Self-hosted oder EU-Cloud mit AVV. Mandantendaten verlassen nie eure Kontrolle und werden niemals zum KI-Training genutzt. § 203 StGB, Akten-Isolation, jede Antwort mit Fundstelle.",
  alternates: { canonical: "/de/subsumio/sicherheit", languages: { en: "/subsumio/sicherheit", de: "/de/subsumio/sicherheit" } },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/de/subsumio" }, { name: "Sicherheit & DSGVO", url: "/de/subsumio/sicherheit" }])} />
      <SicherheitPage lang="de" />
    </>
  );
}
