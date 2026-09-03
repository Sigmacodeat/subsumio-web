import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd, breadcrumbLd } from "@/components/seo/jsonld";
import { professionalPricing } from "@/content/audiences";

export const metadata: Metadata = {
  title: "Subsumio Preise — Privat, Solo, Kanzlei und Enterprise",
  description:
    "Getrennte Preise für Privatpersonen und professionelle Aktenarbeit. Solo CHF 249/Monat, Kanzlei CHF 1.499/Monat inklusive 5 Nutzern, monatlich kündbar.",
  alternates: {
    canonical: "/ch/pricing",
    languages: {
      "de-DE": "/pricing",
      "de-AT": "/at/pricing",
      "de-CH": "/ch/pricing",
      en: "/en/pricing",
    },
  },
  openGraph: {
    title: "Subsumio Preise — Privat, Solo, Kanzlei und Enterprise",
    description:
      "Getrennte Preise für Privatpersonen und professionelle Aktenarbeit. Solo CHF 249/Monat, monatlich kündbar.",
    url: "/ch/pricing",
    type: "website",
  },
};

export default function Page() {
  const pricing = professionalPricing("ch");
  const offers = pricing.tiers
    .filter((t) => t.id !== "ent")
    .map((t) => ({
      "@type": "Offer" as const,
      name: t.name,
      price: t.price.replace(/[^\d.]/g, ""),
      priceCurrency: "CHF",
      description: t.blurb,
    }));

  return (
    <>
      <JsonLd
        data={{
          ...softwareApplicationLd("ch"),
          offers: [
            ...offers,
            {
              "@type": "Offer",
              name: "Enterprise",
              priceSpecification: {
                "@type": "PriceSpecification",
                priceCurrency: "CHF",
              },
              description: pricing.tiers.find((t) => t.id === "ent")?.blurb,
            },
          ],
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/ch" },
          { name: "Preise", url: "/ch/pricing" },
        ])}
      />
      <PricingPage lang="ch" />
    </>
  );
}
