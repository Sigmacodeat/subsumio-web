import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";

export const metadata: Metadata = {
  title: "Partnerprogramm — 30 % wiederkehrend verdienen",
  description: "Sigmabrain empfehlen und 30 % wiederkehrende Provision für 12 Monate verdienen. Affiliate-, Referral- und zertifizierte Partner-Tracks.",
  alternates: { canonical: "/de/partners", languages: { en: "/partners", de: "/de/partners" } },
};

export default function Page() {
  return <PartnersPage lang="de" />;
}
