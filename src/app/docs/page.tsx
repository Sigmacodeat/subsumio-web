import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";

export const metadata: Metadata = {
  title: "Subsumio Docs — legal software features catalog",
  description:
    "Complete feature documentation — 72 API endpoints, 57 dashboard pages, 10 categories. Brain, cases, deadlines, billing, security, mobile. Directly from source.",
  alternates: { canonical: "/docs", languages: { en: "/docs", de: "/de/docs" } },
};

export default function Page() {
  return <DocsPage lang="en" />;
}
