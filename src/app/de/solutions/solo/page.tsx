import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.de["solo"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/solutions/solo",
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
    url: "/de/solutions/solo",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Lösungen", url: "/de/solutions/solo" },
          { name: "Einzelanwälte", url: "/de/solutions/solo" },
        ])}
      />
      <SolutionPage lang="de" content={content} />
    </>
  );
}
