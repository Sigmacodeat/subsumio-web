import type { Metadata } from "next";
import { WhatsAppPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio WhatsApp-Copilot — die Kanzlei in der Hosentasche",
  description:
    "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain. GoBD-konform dokumentiert.",
  alternates: {
    canonical: "/ch/whatsapp",
    languages: {
      "de-DE": "/whatsapp",
      "de-AT": "/at/whatsapp",
      "de-CH": "/ch/whatsapp",
      en: "/en/whatsapp",
    },
  },
  openGraph: {
    title: "Subsumio WhatsApp-Copilot — die Kanzlei in der Hosentasche",
    description:
      "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel. Bestätigungspflichtig, nichts ungesehen. GoBD-konform.",
    url: "/ch/whatsapp",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/ch" },
          { name: "WhatsApp-Copilot", url: "/ch/whatsapp" },
        ])}
      />
      <WhatsAppPage lang="ch" />
    </>
  );
}
