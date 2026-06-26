import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";
import { PRICING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio Pricing — AI legal software from €890/seat/mo | No lock-in",
  description:
    "Transparent per-seat pricing for AI legal software. Hosted plans from €890/seat/mo billed annually — EU cloud or self-hosted, 14-day reverse trial, no surprise bills, no vendor lock-in.",
  alternates: { canonical: "/pricing", languages: { en: "/pricing", de: "/de/pricing" } },
  openGraph: {
    title: "Subsumio Pricing — AI legal software from €890/seat/mo | No lock-in",
    description:
      "Transparent per-seat pricing for AI legal software. Hosted plans from €890/seat/mo — EU cloud or self-hosted, 14-day reverse trial, no surprise bills.",
    url: "/pricing",
    type: "website",
  },
};

export default function Page() {
  const offers = PRICING.en.tiers
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
              description: PRICING.en.tiers.find((t) => t.id === "ent")?.blurb,
            },
          ],
        }}
      />
      <PricingPage lang="en" />
    </>
  );
}
