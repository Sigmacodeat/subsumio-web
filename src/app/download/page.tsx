import type { Metadata } from "next";
import DownloadPage from "@/components/marketing/download-page";
import { DOWNLOAD } from "@/content/download";

export const metadata: Metadata = {
  title: DOWNLOAD.en.metaTitle,
  description: DOWNLOAD.en.metaDesc,
  alternates: { canonical: "/download", languages: { en: "/download", de: "/de/download" } },
};

export default function Page() {
  return <DownloadPage lang="en" />;
}
