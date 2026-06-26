import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.en["in-house"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/solutions/in-house",
    languages: { en: "/solutions/in-house", de: "/de/solutions/in-house" },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/solutions/in-house",
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
          { name: "Solutions", url: "/solutions/in-house" },
          { name: "In-House", url: "/solutions/in-house" },
        ])}
      />
      <SolutionPage lang="en" content={content} />
    </>
  );
}
