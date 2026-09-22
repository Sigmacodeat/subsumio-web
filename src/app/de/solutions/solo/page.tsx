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

const content = SOLUTIONS["solo"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/de/solutions/solo",
    languages: {
      "de-DE": "/de/solutions/solo",
      "de-AT": "/at/solutions/solo",
      "x-default": "/at/solutions/solo",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/de/solutions/solo",
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
          { name: "Einzelanwälte", url: "/de/solutions/solo" },
        ])}
      />
      <SolutionPage market="de" content={content} />
    </>
  );
}
