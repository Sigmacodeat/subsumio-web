import type { Metadata } from "next";
import PartnersPage from "@/components/marketing/partners-page";

export const metadata: Metadata = {
  title: "Partnerprogramm — 30 % wiederkehrend verdienen",
  description:
    "Subsumio empfehlen und wiederkehrende Provision über die Laufzeit jeder zahlenden Empfehlung verdienen. Affiliate-, Referral- und zertifizierte Partner-Tracks.",
  alternates: { canonical: "/de/partners", languages: { en: "/partners", de: "/de/partners" } },
};

export default function Page() {
  return <PartnersPage lang="de" />;
}
