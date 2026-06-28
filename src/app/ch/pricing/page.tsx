import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd, breadcrumbLd } from "@/components/seo/jsonld";
import { PRICING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer",
  description:
    "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. jährlich — EU-Cloud oder On-Premise, 14 Tage volle Testversion, keine Überraschungsrechnung, kein Lock-in. DATEV-Export, Kollisionsprüfung, Fristenkontrolle inklusive.",
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
    title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer",
    description:
      "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. — EU-Cloud oder On-Premise, 14 Tage volle Testversion, keine Überraschungsrechnung.",
    url: "/ch/pricing",
    type: "website",
  },
};

export default function Page() {
  const offers = PRICING.ch.tiers
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
          ...softwareApplicationLd("ch"),
          offers: [
            ...offers,
            {
              "@type": "Offer",
              name: "Enterprise",
              priceSpecification: {
                "@type": "PriceSpecification",
                priceCurrency: "EUR",
              },
              description: PRICING.ch.tiers.find((t) => t.id === "ent")?.blurb,
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
