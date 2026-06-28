import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: DOWNLOAD.de.metaTitle,
  description: DOWNLOAD.de.metaDesc,
  keywords: keywordsFor("download"),
  alternates: { canonical: "/download", languages: { de: "/download", en: "/en/download" } },
  openGraph: {
    title: DOWNLOAD.de.metaTitle,
    description: DOWNLOAD.de.metaDesc,
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
      <DownloadPage lang="de" />
    </>
  );
}
