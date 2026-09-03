import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd, breadcrumbLd } from "@/components/seo/jsonld";
import { professionalPricing } from "@/content/audiences";

export const metadata: Metadata = {
  title: "Subsumio Pricing — Private, Solo, Firm and Enterprise",
  description:
    "Separate pricing for private orientation and professional case work. Solo €249/month, Firm €1.499/month including five users, cancel monthly.",
  alternates: {
    canonical: "/en/pricing",
    languages: {
      "de-DE": "/pricing",
      "de-AT": "/at/pricing",
      "de-CH": "/ch/pricing",
      en: "/en/pricing",
    },
  },
  openGraph: {
    title: "Subsumio Pricing — Private, Solo, Firm and Enterprise",
    description:
      "Separate pricing for private orientation and professional case work. Solo €249/month, cancel monthly.",
    url: "/en/pricing",
    type: "website",
  },
};

export default function Page() {
  const pricing = professionalPricing("en");
  const offers = pricing.tiers
    .filter((t) => t.id !== "ent")
    .map((t) => ({
      "@type": "Offer" as const,
      name: t.name,
      price: t.price.replace(/[^\d.]/g, ""),
      priceCurrency: "EUR",
      description: t.blurb,
    }));

  return (
    <>
      <JsonLd
        data={{
          ...softwareApplicationLd("en"),
          offers: [
            ...offers,
            {
              "@type": "Offer",
              name: "Enterprise",
              priceSpecification: {
                "@type": "PriceSpecification",
                priceCurrency: "EUR",
              },
              description: pricing.tiers.find((t) => t.id === "ent")?.blurb,
            },
          ],
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/en" },
          { name: "Pricing", url: "/en/pricing" },
        ])}
      />
      <PricingPage lang="en" />
    </>
  );
}
