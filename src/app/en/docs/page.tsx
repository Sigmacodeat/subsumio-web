import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Subsumio Docs — AI legal software handbook",
  description:
    "Product handbook for Subsumio: matters, deadlines, documents, cited AI answers, security, integrations and the dashboard workflows behind them.",
  alternates: {
    canonical: "/en/docs",
    languages: { "de-DE": "/docs", "de-AT": "/at/docs", "de-CH": "/ch/docs", en: "/en/docs" },
  },
  openGraph: {
    title: "Subsumio Docs — AI legal software handbook",
    description:
      "Product handbook for Subsumio: matters, deadlines, documents, cited AI answers, security, integrations and the dashboard workflows behind them.",
    url: "/en/docs",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Docs", url: "/en/docs" },
        ])}
      />
      <DocsPage lang="en" />
    </>
  );
}
