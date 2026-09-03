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

const product = PRODUCTS.at.taxumio;
const canonical = "/at/taxumio";

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
          { name: "Subsumio", url: "/at" },
          { name: product.name, url: canonical },
        ])}
      />
      <JsonLd data={faqPageLd(VERTICALS.at[product.vertical].faq)} />
      <VerticalPage lang="at" slug={product.vertical} product={product} />
    </>
  );
}
