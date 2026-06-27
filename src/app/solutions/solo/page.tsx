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
    languages: { de: "/solutions/solo", en: "/en/solutions/solo" },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/solutions/solo",
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
          { name: "Lösungen", url: "/solutions/solo" },
          { name: "Einzelanwälte", url: "/solutions/solo" },
        ])}
      />
      <SolutionPage lang="de" content={content} />
    </>
  );
}
