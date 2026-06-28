import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "About Subsumio — AI legal software from Austria",
  description:
    "Subsumio is built in Austria for law firms in AT, DE and CH. Our mission: cited AI answers for legal work, with confidentiality by architecture — EU cloud or self-hosted. No training on client data.",
  alternates: {
    canonical: "/en/about",
    languages: {
      "de-DE": "/about",
      "de-AT": "/at/about",
      "de-CH": "/ch/about",
      en: "/en/about",
      "x-default": "/about",
    },
  },
  openGraph: {
    title: "About Subsumio — AI legal software from Austria",
    description:
      "Subsumio is built in Austria for law firms in AT, DE and CH. Cited AI answers for legal work, with confidentiality by architecture — EU cloud or self-hosted.",
    url: "/en/about",
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
          { name: "About", url: "/en/about" },
        ])}
      />
      <AboutPage lang="en" />
    </>
  );
}
