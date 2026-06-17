import type { Metadata } from "next";
import { PrivacyContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Datenschutz — Sigmabrain",
  robots: { index: false },
};

export default function PrivacyPage() {
  return <PrivacyContent home="/de" />;
}
