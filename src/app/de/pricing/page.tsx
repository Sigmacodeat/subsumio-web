import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";

export const metadata: Metadata = {
  title: "Preise",
  description: "Kostenlos starten mit der Open-Source-Engine. Gehostete Pläne ab 79 €/Monat. Keine Überraschungsrechnung, kein Lock-in.",
  alternates: { canonical: "/de/pricing", languages: { en: "/pricing", de: "/de/pricing" } },
};

export default function Page() {
  return <PricingPage lang="de" />;
}
