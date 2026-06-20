import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";

export const metadata: Metadata = {
  title: "Partner Program — earn 30% recurring",
  description: "Recommend Subsumio and earn 30% recurring commission for 12 months. Affiliate, customer referral and certified partner tracks.",
  alternates: { canonical: "/partners", languages: { en: "/partners", de: "/de/partners" } },
};

export default function Page() {
  return <PartnersPage lang="en" />;
}
