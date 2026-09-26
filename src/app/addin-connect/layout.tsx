import type { Metadata } from "next";
import type { ReactNode } from "react";

// Sign-in dialog of the Office add-ins — no marketing chrome, never indexed.
export const metadata: Metadata = {
  title: "Add-in verbinden",
  robots: { index: false, follow: false },
};

export default function AddinConnectLayout({ children }: { children: ReactNode }) {
  return children;
}
