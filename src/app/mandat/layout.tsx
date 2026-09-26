import type { Metadata } from "next";
import type { ReactNode } from "react";

// Firm-specific public form — not Subsumio marketing content.
export const metadata: Metadata = {
  title: "Erstanfrage-Assistent",
  robots: { index: false, follow: false },
};

export default function MandatLayout({ children }: { children: ReactNode }) {
  return children;
}
