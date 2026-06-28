import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.ch["in-house"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/ch/solutions/in-house",
    languages: {
      "de-DE": "/solutions/in-house",
      "de-AT": "/at/solutions/in-house",
      "de-CH": "/ch/solutions/in-house",
      en: "/en/solutions/in-house",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/ch/solutions/in-house",
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
          { name: "Lösungen", url: "/ch/solutions/in-house" },
          { name: "Justiziariate", url: "/ch/solutions/in-house" },
        ])}
      />
      <SolutionPage lang="ch" content={content} />
    </>
  );
}
