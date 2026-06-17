import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";

export const metadata: Metadata = {
  title: DOWNLOAD.de.metaTitle,
  description: DOWNLOAD.de.metaDesc,
  alternates: { canonical: "/de/download", languages: { en: "/download", de: "/de/download" } },
};

export default function Page() {
  return <DownloadPage lang="de" />;
}
