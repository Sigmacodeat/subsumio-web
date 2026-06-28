import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.ch["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/ch/solutions/law-firms",
    languages: {
      "de-DE": "/solutions/law-firms",
      "de-AT": "/at/solutions/law-firms",
      "de-CH": "/ch/solutions/law-firms",
      en: "/en/solutions/law-firms",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/ch/solutions/law-firms",
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
          { name: "Lösungen", url: "/ch/solutions/law-firms" },
          { name: "Kanzleien", url: "/ch/solutions/law-firms" },
        ])}
      />
      <SolutionPage lang="ch" content={content} />
    </>
  );
}
