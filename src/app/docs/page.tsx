import type { Metadata } from "next";
import DocsPage from "@/components/marketing/docs-page";

export const metadata: Metadata = {
  title: "Docs — Everything Sigmabrain does",
  description: "Complete feature documentation extracted directly from the source code. No marketing fluff, just facts.",
};

export default function Page() {
  return <DocsPage lang="en" />;
}
