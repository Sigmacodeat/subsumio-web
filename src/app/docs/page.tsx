import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Docs — AI legal software handbook",
  description:
    "Product handbook for Subsumio: matters, deadlines, documents, cited AI answers, security, integrations and the dashboard workflows behind them.",
  alternates: { canonical: "/docs", languages: { en: "/docs", de: "/de/docs" } },
  openGraph: {
    title: "Subsumio Docs — AI legal software handbook",
    description:
      "Product handbook for Subsumio: matters, deadlines, documents, cited AI answers, security, integrations and the dashboard workflows behind them.",
    url: "/docs",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Docs", url: "/docs" },
        ])}
      />
      <DocsPage lang="en" />
    </>
  );
}
