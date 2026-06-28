import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: DOWNLOAD.de.metaTitle,
  description: DOWNLOAD.de.metaDesc,
  alternates: {
    canonical: "/download",
    languages: {
      "de-DE": "/download",
      "de-AT": "/at/download",
      "de-CH": "/ch/download",
      en: "/en/download",
    },
  },
  openGraph: {
    title: DOWNLOAD.de.metaTitle,
    description: DOWNLOAD.de.metaDesc,
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
      <DownloadPage lang="de" />
    </>
  );
}
