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

const content = SOLUTIONS["in-house"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/at/solutions/in-house",
    languages: {
      "de-AT": "/at/solutions/in-house",
      "de-DE": "/de/solutions/in-house",
      "x-default": "/at/solutions/in-house",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/at/solutions/in-house",
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
          { name: "Justiziariate", url: "/at/solutions/in-house" },
        ])}
      />
      <SolutionPage content={content} />
    </>
  );
}
