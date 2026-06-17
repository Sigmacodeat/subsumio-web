import type { Metadata } from "next";
import PricingPage from "@/components/marketing/pricing-page";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with the open-source engine. Hosted plans from €79/month. No surprise bills, no vendor lock-in.",
  alternates: { canonical: "/pricing", languages: { en: "/pricing", de: "/de/pricing" } },
};

export default function Page() {
  return <PricingPage lang="en" />;
}
