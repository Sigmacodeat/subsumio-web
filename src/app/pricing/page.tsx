import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";
import { PRICING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — Legal software pricing, per seat",
  description:
    "Hosted plans from €290/seat/mo, billed annually. Self-hosted or EU cloud. No surprise bills, no vendor lock-in, 14-day reverse trial.",
  alternates: { canonical: "/pricing", languages: { en: "/pricing", de: "/de/pricing" } },
};

export default function Page() {
  const offers = PRICING.en.tiers
    .filter((t) => t.price !== "Custom")
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
              description: PRICING.en.tiers.find((t) => t.id === "ent")?.blurb,
            },
          ],
        }}
      />
      <PricingPage lang="en" />
    </>
  );
}
