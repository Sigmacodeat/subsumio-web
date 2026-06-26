import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.de["mid-sized"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/de/solutions/mid-sized",
    languages: { en: "/solutions/mid-sized", de: "/de/solutions/mid-sized" },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/de/solutions/mid-sized",
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
          { name: "Lösungen", url: "/de/solutions/mid-sized" },
          { name: "Mittelständische", url: "/de/solutions/mid-sized" },
        ])}
      />
      <SolutionPage lang="de" content={content} />
    </>
  );
}
