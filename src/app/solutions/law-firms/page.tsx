import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.en["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/solutions/law-firms",
    languages: { en: "/solutions/law-firms", de: "/de/solutions/law-firms" },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/solutions/law-firms",
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
          { name: "Solutions", url: "/solutions/law-firms" },
          { name: "Law Firms", url: "/solutions/law-firms" },
        ])}
      />
      <SolutionPage lang="en" content={content} />
    </>
  );
}
