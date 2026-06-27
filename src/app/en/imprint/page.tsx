import type { Metadata } from "next";
import { ImprintContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Imprint",
  description:
    "Legal notice and operator information for Subsumio — the AI legal workspace for DACH law firms.",
  alternates: { canonical: "/en/imprint", languages: { de: "/imprint", en: "/en/imprint" } },
  openGraph: {
    title: "Imprint — Subsumio",
    description:
      "Legal notice and operator information for Subsumio — the AI legal workspace for DACH law firms.",
    url: "/en/imprint",
    type: "website",
  },
};

export default function ImprintPage() {
  return <ImprintContent home="/en" lang="en" />;
}
