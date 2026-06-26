import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "About Subsumio — AI legal software built in Austria for DACH law firms",
  description:
    "Subsumio is built in Austria for law firms in AT, DE and CH. Our mission: cited AI answers for legal work, with confidentiality by architecture — EU cloud or self-hosted.",
  alternates: { canonical: "/about", languages: { en: "/about", de: "/de/about" } },
  openGraph: {
    title: "About Subsumio — AI legal software built in Austria for DACH law firms",
    description:
      "Subsumio is built in Austria for law firms in AT, DE and CH. Our mission: cited AI answers for legal work, with confidentiality by architecture.",
    url: "/about",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/" }, { name: "About", url: "/about" }])} />
      <AboutPage lang="en" />
    </>
  );
}
