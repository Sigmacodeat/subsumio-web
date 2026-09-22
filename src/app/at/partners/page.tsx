import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Partnerprogramm — 30 % lebenslange Provision",
  description:
    "Kanzleien zu Subsumio empfehlen und 30 % wiederkehrende Provision über die Laufzeit jedes zahlenden Mandanten erhalten. Drei Tracks: Affiliate, Kunden-Referral und zertifizierter Partner. KI-Kanzleisoftware für österreichische Kanzleien.",
  alternates: {
    canonical: "/at/partners",
    languages: { "de-AT": "/at/partners", "de-DE": "/de/partners", "x-default": "/at/partners" },
  },
  openGraph: {
    title: "Subsumio Partnerprogramm — 30 % lebenslange Provision",
    description:
      "Kanzleien zu Subsumio empfehlen und 30 % wiederkehrende Provision über die Laufzeit jedes zahlenden Mandanten erhalten. Drei Tracks: Affiliate, Kunden-Referral und zertifizierter Partner.",
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
