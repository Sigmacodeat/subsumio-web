import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";
import { PRICING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer/Mon. | Kein Lock-in",
  description:
    "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. jährlich — EU-Cloud oder On-Premise, 14 Tage volle Testversion, keine Überraschungsrechnung, kein Lock-in. DATEV-Export, Kollisionsprüfung, Fristenkontrolle inklusive.",
  alternates: {
    canonical: "/at/pricing",
    languages: {
      "de-DE": "/pricing",
      "de-AT": "/at/pricing",
      "de-CH": "/ch/pricing",
      en: "/en/pricing",
    },
  },
  openGraph: {
    title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer/Mon. | Kein Lock-in",
    description:
      "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. — EU-Cloud oder On-Premise, 14 Tage volle Testversion, keine Überraschungsrechnung.",
    url: "/at/pricing",
    type: "website",
  },
};

export default function Page() {
  const offers = PRICING.at.tiers
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
          ...softwareApplicationLd("at"),
          offers: [
            ...offers,
            {
              "@type": "Offer",
              name: "Enterprise",
              priceSpecification: {
                "@type": "PriceSpecification",
                priceCurrency: "EUR",
              },
              description: PRICING.at.tiers.find((t) => t.id === "ent")?.blurb,
            },
          ],
        }}
      />
      <PricingPage lang="at" />
    </>
  );
}
