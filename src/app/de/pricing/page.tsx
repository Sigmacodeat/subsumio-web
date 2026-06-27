import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd } from "@/components/seo/jsonld";
import { PRICING } from "@/content/site";

export const metadata: Metadata = {
  title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer/Mon. | Kein Lock-in",
  description:
    "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. jährlich — EU-Cloud oder On-Premise, 14 Tage volle Testversion, keine Überraschungsrechnung, kein Lock-in. DATEV-Export, Kollisionsprüfung, Fristenkontrolle inklusive.",
  alternates: { canonical: "/de/pricing", languages: { en: "/pricing", de: "/de/pricing" } },
  openGraph: {
    title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer/Mon. | Kein Lock-in",
    description:
      "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. — EU-Cloud oder On-Premise, 14 Tage volle Testversion, keine Überraschungsrechnung.",
    url: "/de/pricing",
    type: "website",
  },
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
