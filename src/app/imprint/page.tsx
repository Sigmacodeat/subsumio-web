import type { Metadata } from "next";
import { ImprintContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Imprint",
  description: "Legal notice and operator information for Subsumio — the AI legal workspace for DACH law firms.",
  alternates: { canonical: "/imprint", languages: { en: "/imprint", de: "/de/imprint" } },
};

export default function ImprintPage() {
  return <ImprintContent home="/" />;
}
