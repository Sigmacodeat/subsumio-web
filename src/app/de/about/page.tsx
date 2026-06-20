import type { Metadata } from "next";
import AboutPage from "@/components/marketing/about-page";

export const metadata: Metadata = {
  title: "Über Subsumio — Legal Intelligence aus Österreich",
  description:
    "Subsumio wird in Österreich für DACH-Kanzleien gebaut. Erfahre über unsere Mission, unser Team und unseren Ansatz für vertrauliche KI für Rechtsarbeit.",
  alternates: { canonical: "/de/about", languages: { en: "/about", de: "/de/about" } },
};

export default function Page() {
  return <AboutPage lang="de" />;
}
