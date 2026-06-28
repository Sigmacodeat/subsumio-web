import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.ch["solo"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/ch/solutions/solo",
    languages: {
      "de-DE": "/solutions/solo",
      "de-AT": "/at/solutions/solo",
      "de-CH": "/ch/solutions/solo",
      en: "/en/solutions/solo",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/ch/solutions/solo",
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
          { name: "Lösungen", url: "/ch/solutions/solo" },
          { name: "Einzelanwälte", url: "/ch/solutions/solo" },
        ])}
      />
      <SolutionPage lang="ch" content={content} />
    </>
  );
}
