import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS_DE as SOLUTIONS } from "@/content/solutions-de";
import {
  JsonLd,
  organizationLd,
  softwareApplicationLd,
  faqPageLd,
  breadcrumbLd,
} from "@/components/seo/jsonld";

const content = SOLUTIONS["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/de/solutions/law-firms",
    languages: {
      "de-DE": "/de/solutions/law-firms",
      "de-AT": "/at/solutions/law-firms",
      "x-default": "/at/solutions/law-firms",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/de/solutions/law-firms",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqPageLd(content.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Kanzleien", url: "/de/solutions/law-firms" },
        ])}
      />
      <SolutionPage market="de" content={content} />
    </>
  );
}
