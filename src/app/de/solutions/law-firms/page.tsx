import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.de["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/de/solutions/law-firms",
    languages: { en: "/solutions/law-firms", de: "/de/solutions/law-firms" },
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Lösungen", url: "/de/solutions/law-firms" },
          { name: "Kanzleien", url: "/de/solutions/law-firms" },
        ])}
      />
      <SolutionPage lang="de" content={content} />
    </>
  );
}
