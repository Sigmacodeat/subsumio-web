import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anonymisierung",
};

export default function AnonymizeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
