import type { Metadata } from "next";
import VerticalPage from "@/components/marketing/vertical";
import { PRODUCTS } from "@/content/products";
import { VERTICALS } from "@/content/verticals";
import {
  JsonLd,
  faqPageLd,
  organizationLd,
  verticalSoftwareApplicationLd,
  breadcrumbLd,
} from "@/components/seo/jsonld";
import { taxumioCanonical } from "@/lib/brand";

const product = PRODUCTS.en.taxumio;
const canonical = taxumioCanonical("en");

export const metadata: Metadata = {
  title: { absolute: product.metaTitle },
  description: product.metaDesc,
  alternates: {
    canonical,
    languages: {
      "de-DE": "/taxumio",
      "de-AT": "/at/taxumio",
      "de-CH": "/ch/taxumio",
      en: "/en/taxumio",
      "x-default": "/taxumio",
    },
  },
  openGraph: {
    title: product.metaTitle,
    description: product.metaDesc,
    url: canonical,
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={verticalSoftwareApplicationLd({
          name: product.name,
          description: product.metaDesc,
          url: canonical,
          price: "249",
          category: "FinanceApplication",
          basedOn: "Subsumio",
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/en" },
          { name: product.name, url: canonical },
        ])}
      />
      <JsonLd data={faqPageLd(VERTICALS.en[product.vertical].faq)} />
      <VerticalPage lang="en" slug={product.vertical} product={product} />
    </>
  );
}
