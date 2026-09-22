import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: DOWNLOAD.metaTitle,
  description: DOWNLOAD.metaDesc,
  alternates: {
    canonical: "/at/download",
    languages: { "de-AT": "/at/download", "de-DE": "/de/download", "x-default": "/at/download" },
  },
  openGraph: {
    title: DOWNLOAD.metaTitle,
    description: DOWNLOAD.metaDesc,
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
      <DownloadPage />
    </>
  );
}
