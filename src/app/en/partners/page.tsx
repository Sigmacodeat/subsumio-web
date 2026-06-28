import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Partner Program — 30% lifetime commission",
  description:
    "Refer law firms to Subsumio and earn 30% recurring commission for the lifetime of each paying client. Three tracks: affiliate, customer referral, and certified partner. AI legal software for AT, DE and CH.",
  alternates: {
    canonical: "/en/partners",
    languages: {
      "de-DE": "/partners",
      "de-AT": "/at/partners",
      "de-CH": "/ch/partners",
      en: "/en/partners",
    },
  },
  openGraph: {
    title: "Subsumio Partner Program — 30% lifetime commission",
    description:
      "Refer law firms to Subsumio and earn 30% recurring commission for the lifetime of each paying client. Three tracks: affiliate, customer referral, and certified partner.",
    url: "/en/partners",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Partners", url: "/en/partners" },
        ])}
      />
      <PartnersPage lang="en" />
    </>
  );
}
