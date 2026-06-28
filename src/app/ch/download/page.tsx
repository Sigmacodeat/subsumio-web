import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: DOWNLOAD.ch.metaTitle,
  description: DOWNLOAD.ch.metaDesc,
  alternates: {
    canonical: "/ch/download",
    languages: {
      "de-DE": "/download",
      "de-AT": "/at/download",
      "de-CH": "/ch/download",
      en: "/en/download",
    },
  },
  openGraph: {
    title: DOWNLOAD.ch.metaTitle,
    description: DOWNLOAD.ch.metaDesc,
    url: "/ch/download",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/ch" },
          { name: "Download", url: "/ch/download" },
        ])}
      />
      <DownloadPage lang="ch" />
    </>
  );
}
