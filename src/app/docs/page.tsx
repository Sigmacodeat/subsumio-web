import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";

export const metadata: Metadata = {
  title: "Subsumio Docs — AI legal software handbook",
  description:
    "Product handbook for Subsumio: matters, deadlines, documents, cited AI answers, security, integrations and the dashboard workflows behind them.",
  alternates: { canonical: "/docs", languages: { en: "/docs", de: "/de/docs" } },
};

export default function Page() {
  return <DocsPage lang="en" />;
}
