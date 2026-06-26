import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Partnerprogramm — 30 % lebenslange Provision auf Empfehlungen",
  description:
    "Kanzleien zu Subsumio empfehlen und 30 % wiederkehrende Provision über die Laufzeit jedes zahlenden Mandanten erhalten. Drei Tracks: Affiliate, Kunden-Referral und zertifizierter Partner.",
  alternates: { canonical: "/de/partners", languages: { en: "/partners", de: "/de/partners" } },
  openGraph: {
    title: "Subsumio Partnerprogramm — 30 % lebenslange Provision auf Empfehlungen",
    description:
      "Kanzleien zu Subsumio empfehlen und 30 % wiederkehrende Provision über die Laufzeit jedes zahlenden Mandanten erhalten. Drei Tracks: Affiliate, Kunden-Referral und zertifizierter Partner.",
    url: "/de/partners",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/de" }, { name: "Partnerprogramm", url: "/de/partners" }])} />
      <PartnersPage lang="de" />
    </>
  );
}
