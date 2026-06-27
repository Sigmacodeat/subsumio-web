import type { Metadata } from "next";
import { WhatsAppPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio WhatsApp-Copilot — die Kanzlei in der Hosentasche",
  description:
    "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain. GoBD-konform dokumentiert.",
  alternates: { canonical: "/de/whatsapp", languages: { en: "/whatsapp", de: "/de/whatsapp" } },
  openGraph: {
    title: "Subsumio WhatsApp-Copilot — die Kanzlei in der Hosentasche",
    description:
      "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel. Bestätigungspflichtig, nichts ungesehen. GoBD-konform.",
    url: "/de/whatsapp",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "WhatsApp-Copilot", url: "/de/whatsapp" },
        ])}
      />
      <WhatsAppPage lang="de" />
    </>
  );
}
