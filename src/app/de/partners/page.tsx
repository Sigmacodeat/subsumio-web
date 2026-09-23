import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Partnerprogramm — bis zu 30 % wiederkehrende Provision",
  description:
    "Kanzleien zu Subsumio empfehlen und bis zu 30 % wiederkehrende Provision erhalten, solange der vermittelte Kunde zahlt. Drei Wege: Empfehlungspartner, Kunden-Empfehlungen und Einführungspartner. KI-Kanzleisoftware für deutsche Kanzleien.",
  alternates: {
    canonical: "/de/partners",
    languages: { "de-DE": "/de/partners", "de-AT": "/at/partners", "x-default": "/at/partners" },
  },
  openGraph: {
    title: "Subsumio Partnerprogramm — bis zu 30 % wiederkehrende Provision",
    description:
      "Kanzleien zu Subsumio empfehlen und bis zu 30 % wiederkehrende Provision erhalten, solange der vermittelte Kunde zahlt. Drei Wege: Empfehlungspartner, Kunden-Empfehlungen und Einführungspartner.",
    url: "/de/partners",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd("de")} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Partnerprogramm", url: "/de/partners" },
        ])}
      />
      <PartnersPage market="de" />
    </>
  );
}
