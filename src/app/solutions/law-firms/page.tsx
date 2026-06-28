import type { Metadata } from "next";
import { SolutionPage } from "@/components/marketing/solution-page";
import { SOLUTIONS } from "@/content/solutions";
import { JsonLd, organizationLd, breadcrumbLd, serviceLd } from "@/components/seo/jsonld";

const content = SOLUTIONS.de["law-firms"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDesc,
  alternates: {
    canonical: "/solutions/law-firms",
    languages: { de: "/solutions/law-firms", en: "/en/solutions/law-firms" },
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
        data={serviceLd({
          name: content.metaTitle,
          description: content.metaDesc,
          url: "/solutions/law-firms",
          lang: "de",
          audience: "Kanzleien",
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Lösungen", url: "/solutions/law-firms" },
          { name: "Kanzleien", url: "/solutions/law-firms" },
        ])}
      />
      <SolutionPage lang="de" content={content} />
    </>
  );
}
