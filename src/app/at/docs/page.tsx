import type { Metadata } from "next";
import HandbookPage from "@/components/marketing/handbook/handbook-page";
import { JsonLd, breadcrumbLd } from "@/components/seo/jsonld";

export const metadata: Metadata = {
  title: "Handbuch — so arbeiten Sie mit Subsumio",
  description:
    "Das Subsumio Handbuch: Akten, Fristen und Fristenrechner, Erinnerungen, Kalender mit Terminkollisionen, Kollisionsprüfung nach § 10 RAO, Assistent mit Fundstellen, RATG-Honorar, Treuhand und Sicherheit — mit Ansichten aus dem Produkt.",
  alternates: {
    canonical: "/at/docs",
  },
  openGraph: {
    title: "Handbuch — so arbeiten Sie mit Subsumio",
    description:
      "Das Subsumio Handbuch: Akten, Fristen und Fristenrechner, Erinnerungen, Kalender mit Terminkollisionen, Kollisionsprüfung nach § 10 RAO, Assistent mit Fundstellen, RATG-Honorar, Treuhand und Sicherheit — mit Ansichten aus dem Produkt.",
    url: "/at/docs",
    type: "website",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Handbuch", url: "/at/docs" },
        ])}
      />
      <HandbookPage />
    </>
  );
}
