import type { Metadata } from "next";
import { TermsContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Allgemeine Geschäftsbedingungen",
  robots: { index: false },
};

export default function TermsPage() {
  return <TermsContent home="/" />;
}
