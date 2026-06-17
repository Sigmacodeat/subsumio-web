import type { Metadata } from "next";
import FeaturesPage from "@/components/marketing/features-page";
import { FEATURES_PAGE } from "@/content/features";

export const metadata: Metadata = {
  title: FEATURES_PAGE.de.metaTitle,
  description: FEATURES_PAGE.de.metaDesc,
  alternates: { canonical: "/de/features", languages: { en: "/features", de: "/de/features" } },
};

export default function Page() {
  return <FeaturesPage lang="de" />;
}
