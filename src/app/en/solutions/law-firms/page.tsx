import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.en["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/en/solutions/law-firms",
    languages: { de: "/solutions/law-firms", en: "/en/solutions/law-firms" },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/en/solutions/law-firms",
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
          { name: "Solutions", url: "/en/solutions/law-firms" },
          { name: "Law Firms", url: "/en/solutions/law-firms" },
        ])}
      />
      <SolutionPage lang="en" content={content} />
    </>
  );
}
