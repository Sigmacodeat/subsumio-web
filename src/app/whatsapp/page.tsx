import type { Metadata } from "next";
import { WhatsAppPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "WhatsApp Copilot — your firm in your pocket",
  description:
    "Book time, file documents, query cases — from your phone, no app switch, no training. The copilot understands the case file and files everything with confirmation.",
  alternates: { canonical: "/whatsapp", languages: { en: "/whatsapp", de: "/de/whatsapp" } },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/" }, { name: "WhatsApp copilot", url: "/whatsapp" }])} />
      <WhatsAppPage lang="en" />
    </>
  );
}
