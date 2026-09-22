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

const content = SOLUTIONS["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/at/solutions/law-firms",
    languages: {
      "de-AT": "/at/solutions/law-firms",
      "de-DE": "/de/solutions/law-firms",
      "x-default": "/at/solutions/law-firms",
    },
  },
  openGraph: {
    title: content.metaTitle,
    description: content.metaDesc,
    url: "/at/solutions/law-firms",
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
          { name: "Kanzleien", url: "/at/solutions/law-firms" },
        ])}
      />
      <SolutionPage content={content} />
    </>
  );
}
