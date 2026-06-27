import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.de["in-house"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/solutions/in-house",
    languages: { de: "/solutions/in-house", en: "/en/solutions/in-house" },
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
          { name: "Lösungen", url: "/solutions/in-house" },
          { name: "Justiziariate", url: "/solutions/in-house" },
        ])}
      />
      <SolutionPage lang="de" content={content} />
    </>
  );
}
