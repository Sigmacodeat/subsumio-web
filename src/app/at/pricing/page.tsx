import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd, breadcrumbLd } from "@/components/seo/jsonld";
import { professionalPricing } from "@/content/audiences";

export const metadata: Metadata = {
  title: "Subsumio Preise — Solo, Kanzlei und Enterprise",
  description:
    "Solo 249 €/Monat, Kanzlei 1.499 €/Monat inklusive 5 Nutzern, Enterprise auf Anfrage. Monatlich kündbar, 30 Tage kostenlos testen.",
  alternates: {
    canonical: "/at/pricing",
  },
  openGraph: {
    title: "Subsumio Preise — Solo, Kanzlei und Enterprise",
    description: "Solo 249 €/Monat, Kanzlei 1.499 €/Monat inklusive 5 Nutzern. Monatlich kündbar.",
    url: "/at/pricing",
    type: "website",
  },
};

export default function Page() {
  const pricing = professionalPricing();
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
          ...softwareApplicationLd(),
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
          { name: "Subsumio", url: "/at" },
          { name: "Preise", url: "/at/pricing" },
        ])}
      />
      <PricingPage />
    </>
  );
}
