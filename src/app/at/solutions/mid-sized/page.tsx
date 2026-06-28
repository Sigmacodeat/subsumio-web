import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.at["mid-sized"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/at/solutions/mid-sized",
    languages: {
      "de-DE": "/solutions/mid-sized",
      "de-AT": "/at/solutions/mid-sized",
      "de-CH": "/ch/solutions/mid-sized",
      en: "/en/solutions/mid-sized",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/at/solutions/mid-sized",
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
          { name: "Lösungen", url: "/at/solutions/mid-sized" },
          { name: "Mittelständische", url: "/at/solutions/mid-sized" },
        ])}
      />
      <SolutionPage lang="at" content={content} />
    </>
  );
}
