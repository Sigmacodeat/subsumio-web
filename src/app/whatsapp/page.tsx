import type { Metadata } from "next";
import { WhatsAppPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio WhatsApp Copilot — book time, file documents, query cases from your phone",
  description:
    "Book time, file documents, query cases from WhatsApp — no app switch, no training required. The copilot understands your case file and files everything confirmation-gated, nothing unreviewed. GoBD-compliant.",
  alternates: { canonical: "/whatsapp", languages: { en: "/whatsapp", de: "/de/whatsapp" } },
  openGraph: {
    title: "Subsumio WhatsApp Copilot — book time, file documents, query cases from your phone",
    description:
      "Book time, file documents, query cases from WhatsApp — no app switch, no training required. Confirmation-gated, nothing unreviewed. GoBD-compliant.",
    url: "/whatsapp",
    type: "website",
  },
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
