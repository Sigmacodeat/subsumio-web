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
import { subsumioCanonical } from "@/lib/brand";

const product = PRODUCTS.en.subsumio;
const canonical = subsumioCanonical("en");

export const metadata: Metadata = {
  // absolute → skip the "%s — Subsumio" template (metaTitle already brands it)
  title: { absolute: product.metaTitle },
  description: product.metaDesc,
  alternates: {
    canonical,
    languages: { en: subsumioCanonical("en"), de: subsumioCanonical("de") },
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
          price: "299",
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: product.name, url: canonical },
        ])}
      />
      <JsonLd data={faqPageLd(VERTICALS.en[product.vertical].faq)} />
      <VerticalPage lang="en" slug={product.vertical} product={product} />
    </>
  );
}
