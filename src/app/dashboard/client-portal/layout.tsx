import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mandantenportal",
};

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
