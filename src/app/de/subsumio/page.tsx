import type { Metadata } from "next";
import VerticalPage from "@/components/marketing/vertical";
import { PRODUCTS } from "@/content/products";
import { VERTICALS } from "@/content/verticals";
import { JsonLd, faqPageLd, organizationLd, verticalSoftwareApplicationLd, breadcrumbLd } from "@/components/seo/jsonld";
import { subsumioCanonical } from "@/lib/brand";

const product = PRODUCTS.de.subsumio;
const canonical = subsumioCanonical("de");

export const metadata: Metadata = {
  title: { absolute: product.metaTitle },
  description: product.metaDesc,
  alternates: {
    canonical,
    languages: { en: subsumioCanonical("en"), de: subsumioCanonical("de") },
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={verticalSoftwareApplicationLd({ name: product.name, description: product.metaDesc, url: canonical, price: "299" })} />
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/de" }, { name: product.name, url: canonical }])} />
      <JsonLd data={faqPageLd(VERTICALS.de[product.vertical].faq)} />
      <VerticalPage lang="de" slug={product.vertical} product={product} />
    </>
  );
}
