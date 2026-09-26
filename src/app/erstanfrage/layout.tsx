import type { Metadata } from "next";
import type { ReactNode } from "react";

// Firm-specific public form — not Subsumio marketing content.
export const metadata: Metadata = {
  title: "Erstanfrage",
  robots: { index: false, follow: false },
};

export default function ErstanfrageLayout({ children }: { children: ReactNode }) {
  return children;
}
