import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
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
    canonical: "/at/solutions/solo",
    languages: {
      "de-AT": "/at/solutions/solo",
      "de-DE": "/de/solutions/solo",
      "x-default": "/at/solutions/solo",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/at/solutions/solo",
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
          { name: "Subsumio", url: "/at" },
          { name: "Einzelanwälte", url: "/at/solutions/solo" },
        ])}
      />
      <SolutionPage content={content} />
    </>
  );
}
