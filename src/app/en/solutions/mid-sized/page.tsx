import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.en["mid-sized"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/en/solutions/mid-sized",
    languages: { de: "/solutions/mid-sized", en: "/en/solutions/mid-sized" },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/en/solutions/mid-sized",
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
          { name: "Solutions", url: "/en/solutions/mid-sized" },
          { name: "Mid-Sized Firms", url: "/en/solutions/mid-sized" },
        ])}
      />
      <SolutionPage lang="en" content={content} />
    </>
  );
}
