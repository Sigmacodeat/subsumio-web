import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Partnerprogramm — 30 % lebenslange Provision",
  description:
    "Kanzleien zu Subsumio empfehlen und 30 % wiederkehrende Provision über die Laufzeit jedes zahlenden Mandanten erhalten. Drei Tracks: Affiliate, Kunden-Referral und zertifizierter Partner. KI-Kanzleisoftware für AT, DE und CH.",
  alternates: {
    canonical: "/ch/partners",
    languages: {
      "de-DE": "/partners",
      "de-AT": "/at/partners",
      "de-CH": "/ch/partners",
      en: "/en/partners",
    },
  },
  openGraph: {
    title: "Subsumio Partnerprogramm — 30 % lebenslange Provision",
    description:
      "Kanzleien zu Subsumio empfehlen und 30 % wiederkehrende Provision über die Laufzeit jedes zahlenden Mandanten erhalten. Drei Tracks: Affiliate, Kunden-Referral und zertifizierter Partner.",
    url: "/ch/partners",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/ch" },
          { name: "Partnerprogramm", url: "/ch/partners" },
        ])}
      />
      <PartnersPage lang="ch" />
    </>
  );
}
