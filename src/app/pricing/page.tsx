import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd, breadcrumbLd, productLd } from "@/components/seo/jsonld";
import { professionalPricing } from "@/content/audiences";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio Preise — Privat, Solo, Kanzlei und Enterprise",
  description:
    "Getrennte Preise für Privatpersonen und professionelle Aktenarbeit. Solo 179 €/Monat, Kanzlei 999 €/Monat inklusive 5 Nutzern, monatlich kündbar.",
  keywords: keywordsFor("pricing"),
  alternates: { canonical: "/pricing", languages: { de: "/pricing", en: "/en/pricing" } },
  openGraph: {
    title: "Subsumio Preise — Privat, Solo, Kanzlei und Enterprise",
    description:
      "Getrennte Preise für Privatpersonen und professionelle Aktenarbeit. Solo 179 €/Monat, monatlich kündbar.",
    url: "/pricing",
    type: "website",
  },
};

export default function Page() {
  const pricing = professionalPricing("de");
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
              description: pricing.tiers.find((t) => t.id === "ent")?.blurb,
            },
          ],
        }}
      />
      <JsonLd
        data={productLd({
          name: "Subsumio KI-Kanzleisoftware",
          description:
            "KI-Kanzleisoftware für Rechtsanwälte in AT, DE und CH — belegte Antworten, Fristenkontrolle, Kollisionsprüfung, DATEV-Export.",
          url: "/pricing",
          offers: pricing.tiers
            .filter((t) => t.id !== "ent")
            .map((t) => ({
              name: t.name,
              price: t.price.replace(/[^\d.]/g, ""),
              priceCurrency: "EUR",
              description: t.blurb,
            })),
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Preise", url: "/pricing" },
        ])}
      />
      <PricingPage lang="de" />
    </>
  );
}
