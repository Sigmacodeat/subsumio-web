import type { Metadata } from "next";
import { WhatsAppPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio WhatsApp-Copilot — die Kanzlei in der Hosentasche",
  description:
    "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain. GoBD-konform dokumentiert.",
  keywords: keywordsFor("whatsapp"),
  alternates: { canonical: "/whatsapp", languages: { de: "/whatsapp", en: "/en/whatsapp" } },
  openGraph: {
    title: "Subsumio WhatsApp-Copilot — die Kanzlei in der Hosentasche",
    description:
      "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel. Bestätigungspflichtig, nichts ungesehen. GoBD-konform.",
    url: "/whatsapp",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "WhatsApp-Copilot", url: "/whatsapp" },
        ])}
      />
      <WhatsAppPage lang="de" />
    </>
  );
}
