import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";

export const metadata: Metadata = {
  title: "Docs — Everything Subsumio does",
  description: "Complete feature documentation extracted directly from the source code. No marketing fluff, just facts.",
  alternates: { canonical: "/docs", languages: { en: "/docs", de: "/de/docs" } },
};

export default function Page() {
  return <DocsPage lang="en" />;
}
