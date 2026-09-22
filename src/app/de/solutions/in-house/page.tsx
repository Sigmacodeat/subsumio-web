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

const content = SOLUTIONS["in-house"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/de/solutions/in-house",
    languages: {
      "de-DE": "/de/solutions/in-house",
      "de-AT": "/at/solutions/in-house",
      "x-default": "/at/solutions/in-house",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/de/solutions/in-house",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd("de")} />
      <JsonLd data={softwareApplicationLd("de")} />
      <JsonLd data={faqPageLd(content.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Justiziariate", url: "/de/solutions/in-house" },
        ])}
      />
      <SolutionPage market="de" content={content} />
    </>
  );
}
