import type { Metadata } from "next";
import { ImprintContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Impressum — Sigmabrain",
  robots: { index: false },
};

export default function ImprintPage() {
  return <ImprintContent home="/de" />;
}
