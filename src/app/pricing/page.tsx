import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";
import { JsonLd, softwareApplicationLd, breadcrumbLd, productLd } from "@/components/seo/jsonld";
import { PRICING } from "@/content/site";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer",
  description:
    "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. jährlich — EU-Cloud oder On-Premise, 14 Tage volle Testversion, keine Überraschungsrechnung, kein Lock-in. DATEV-Export, Kollisionsprüfung, Fristenkontrolle inklusive.",
  keywords: keywordsFor("pricing"),
  alternates: { canonical: "/pricing", languages: { de: "/pricing", en: "/en/pricing" } },
  openGraph: {
    title: "Subsumio Preise — KI-Kanzleisoftware ab 890 €/Nutzer",
    description:
      "Transparente Preise pro Nutzer für KI-Kanzleisoftware. Gehostete Pläne ab 890 €/Nutzer/Mon. — EU-Cloud oder On-Premise, 14 Tage Testversion, keine Überraschungen.",
    url: "/pricing",
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
      <JsonLd
        data={productLd({
          name: "Subsumio KI-Kanzleisoftware",
          description:
            "KI-Kanzleisoftware für Rechtsanwälte in AT, DE und CH — belegte Antworten, Fristenkontrolle, Kollisionsprüfung, DATEV-Export.",
          url: "/pricing",
          offers: PRICING.de.tiers
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
