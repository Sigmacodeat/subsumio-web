import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.en["mid-sized"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/solutions/mid-sized",
    languages: { en: "/solutions/mid-sized", de: "/de/solutions/mid-sized" },
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Solutions", url: "/solutions/mid-sized" },
          { name: "Mid-Sized Firms", url: "/solutions/mid-sized" },
        ])}
      />
      <SolutionPage lang="en" content={content} />
    </>
  );
}
