import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";
import { PRICING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio — Kanzleisoftware Preise, pro Seat",
  description:
    "Gehostete Pläne ab 890 €/Seat/Mon., jährlich abgerechnet. Self-hosted oder EU-Cloud. Keine Überraschungsrechnung, kein Lock-in, 14-Tage-Reverse-Trial.",
  alternates: { canonical: "/de/pricing", languages: { en: "/pricing", de: "/de/pricing" } },
};

export default function Page() {
  const offers = PRICING.de.tiers
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
          ...softwareApplicationLd("de"),
          offers: [
            ...offers,
            {
              "@type": "Offer",
              name: "Enterprise",
              priceSpecification: {
                "@type": "PriceSpecification",
                priceCurrency: "EUR",
              },
              description: PRICING.de.tiers.find((t) => t.id === "ent")?.blurb,
            },
          ],
        }}
      />
      <PricingPage lang="de" />
    </>
  );
}
