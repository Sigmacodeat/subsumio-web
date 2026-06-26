import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Partner Program — earn 30% lifetime recurring commission",
  description:
    "Refer law firms to Subsumio and earn 30% recurring commission for the lifetime of each paying client. Three tracks: affiliate, customer referral, and certified partner.",
  alternates: { canonical: "/partners", languages: { en: "/partners", de: "/de/partners" } },
  openGraph: {
    title: "Subsumio Partner Program — earn 30% lifetime recurring commission",
    description:
      "Refer law firms to Subsumio and earn 30% recurring commission for the lifetime of each paying client. Three tracks: affiliate, customer referral, and certified partner.",
    url: "/partners",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/" }, { name: "Partners", url: "/partners" }])} />
      <PartnersPage lang="en" />
    </>
  );
}
