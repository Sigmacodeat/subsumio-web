import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: DOWNLOAD.at.metaTitle,
  description: DOWNLOAD.at.metaDesc,
  alternates: {
    canonical: "/at/download",
    languages: {
      "de-DE": "/download",
      "de-AT": "/at/download",
      "de-CH": "/ch/download",
      en: "/en/download",
    },
  },
  openGraph: {
    title: DOWNLOAD.at.metaTitle,
    description: DOWNLOAD.at.metaDesc,
    url: "/at/download",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Download", url: "/at/download" },
        ])}
      />
      <DownloadPage lang="at" />
    </>
  );
}
