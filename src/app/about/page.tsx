import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";

export const metadata: Metadata = {
  title: "About Subsumio — Legal intelligence built in Austria",
  description:
    "Subsumio is built in Austria for DACH law firms. Learn about our mission, team and approach to confidential AI for legal work.",
  alternates: { canonical: "/about", languages: { en: "/about", de: "/de/about" } },
};

export default function Page() {
  return <AboutPage lang="en" />;
}
