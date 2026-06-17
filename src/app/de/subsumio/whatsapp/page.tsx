import type { Metadata } from "next";
import { WhatsAppPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio WhatsApp-Copilot — die Kanzlei in der Hosentasche",
  description:
    "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain.",
  alternates: { canonical: "/de/subsumio/whatsapp", languages: { en: "/subsumio/whatsapp", de: "/de/subsumio/whatsapp" } },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={breadcrumbLd([{ name: "Subsumio", url: "/de/subsumio" }, { name: "WhatsApp-Copilot", url: "/de/subsumio/whatsapp" }])} />
      <WhatsAppPage lang="de" />
    </>
  );
}
