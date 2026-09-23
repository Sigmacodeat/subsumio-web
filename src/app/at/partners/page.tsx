import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Partnerprogramm — bis zu 30 % wiederkehrende Provision",
  description:
    "Kanzleien zu Subsumio empfehlen und bis zu 30 % wiederkehrende Provision erhalten, solange der vermittelte Kunde zahlt. Drei Wege: Empfehlungspartner, Kunden-Empfehlungen und Einführungspartner. KI-Kanzleisoftware für österreichische Kanzleien.",
  alternates: {
    canonical: "/at/partners",
    languages: { "de-AT": "/at/partners", "de-DE": "/de/partners", "x-default": "/at/partners" },
  },
  openGraph: {
    title: "Subsumio Partnerprogramm — bis zu 30 % wiederkehrende Provision",
    description:
      "Kanzleien zu Subsumio empfehlen und bis zu 30 % wiederkehrende Provision erhalten, solange der vermittelte Kunde zahlt. Drei Wege: Empfehlungspartner, Kunden-Empfehlungen und Einführungspartner.",
    url: "/at/partners",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Partnerprogramm", url: "/at/partners" },
        ])}
      />
      <PartnersPage />
    </>
  );
}
