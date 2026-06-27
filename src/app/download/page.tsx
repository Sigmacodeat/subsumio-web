import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: DOWNLOAD.en.metaTitle,
  description: DOWNLOAD.en.metaDesc,
  alternates: { canonical: "/download", languages: { en: "/download", de: "/de/download" } },
  openGraph: {
    title: DOWNLOAD.en.metaTitle,
    description: DOWNLOAD.en.metaDesc,
    url: "/download",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Download", url: "/download" },
        ])}
      />
      <DownloadPage lang="en" />
    </>
  );
}
