import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: DOWNLOAD.metaTitle,
  description: DOWNLOAD.metaDesc,
  alternates: {
    canonical: "/de/download",
    languages: { "de-DE": "/de/download", "de-AT": "/at/download", "x-default": "/at/download" },
  },
  openGraph: {
    title: DOWNLOAD.metaTitle,
    description: DOWNLOAD.metaDesc,
    url: "/de/download",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/de" },
          { name: "Download", url: "/de/download" },
        ])}
      />
      <DownloadPage />
    </>
  );
}
