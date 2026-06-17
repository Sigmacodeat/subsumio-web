import type { Metadata } from "next";
import VerticalPage from "@/components/marketing/vertical";
import { PRODUCTS } from "@/content/products";
import { VERTICALS } from "@/content/verticals";
import { JsonLd, faqPageLd, organizationLd, verticalSoftwareApplicationLd, breadcrumbLd } from "@/components/seo/jsonld";

const product = PRODUCTS.en.subsumio;

export const metadata: Metadata = {
  title: { absolute: product.metaTitle },
  description: product.metaDesc,
  alternates: {
    canonical: "/",
    languages: { en: "/", de: "/de" },
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={verticalSoftwareApplicationLd({ name: product.name, description: product.metaDesc, url: "/", price: "299" })} />
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/" }])} />
      <JsonLd data={faqPageLd(VERTICALS.en[product.vertical].faq)} />
      <VerticalPage lang="en" slug={product.vertical} product={product} />
    </>
  );
}
