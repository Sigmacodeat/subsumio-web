import type { Metadata } from "next";
import { WhatsAppPage } from "@/components/marketing/subsumio-subpages";
import { JsonLd, organizationLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio auf WhatsApp — die Kanzlei in der Hosentasche",
  description:
    "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Assistent erkennt die Akte und legt alles erst nach Ihrer Bestätigung ab.",
  alternates: {
    canonical: "/at/whatsapp",
  },
  openGraph: {
    title: "Subsumio auf WhatsApp — die Kanzlei in der Hosentasche",
    description:
      "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel. Nichts wird ohne Ihre Bestätigung abgelegt.",
    url: "/at/whatsapp",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Assistent auf WhatsApp", url: "/at/whatsapp" },
        ])}
      />
      <WhatsAppPage />
    </>
  );
}
