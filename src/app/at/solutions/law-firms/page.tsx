import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.at["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/at/solutions/law-firms",
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
    url: "/at/solutions/law-firms",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Lösungen", url: "/at/solutions/law-firms" },
          { name: "Kanzleien", url: "/at/solutions/law-firms" },
        ])}
      />
      <SolutionPage lang="at" content={content} />
    </>
  );
}
