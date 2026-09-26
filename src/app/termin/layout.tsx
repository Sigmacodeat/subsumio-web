import type { Metadata } from "next";
import type { ReactNode } from "react";

// Firm-specific public form — not Subsumio marketing content.
export const metadata: Metadata = {
  title: "Termin buchen",
  robots: { index: false, follow: false },
};

export default function TerminLayout({ children }: { children: ReactNode }) {
  return children;
}
