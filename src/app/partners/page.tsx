import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio Partnerprogramm — 30 % lebenslange Provision",
  description:
    "Empfiehl Kanzleien zu Subsumio und erhalte 30 % wiederkehrende Provision. Affiliate, Referral und zertifizierter Partner — für AT, DE und CH.",
  keywords: keywordsFor("partners"),
  alternates: { canonical: "/partners", languages: { de: "/partners", en: "/en/partners" } },
  openGraph: {
    title: "Subsumio Partnerprogramm — 30 % lebenslange Provision",
    description:
      "Empfiehl Kanzleien zu Subsumio und erhalte 30 % wiederkehrende Provision. Affiliate, Referral und zertifizierter Partner.",
    url: "/partners",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Partnerprogramm", url: "/partners" },
        ])}
      />
      <PartnersPage lang="de" />
    </>
  );
}
