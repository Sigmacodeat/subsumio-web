import type { Metadata } from "next";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import BenchmarkMethodologyPage from "@/components/marketing/benchmark-methodology-page";

export const metadata: Metadata = {
  title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
  description:
    "Wie die Subsumio-Suche arbeitet, wie Sie Antworten anhand der Fundstelle prüfen – und warum wir eine Trefferquote erst mit nachprüfbarem Messprotokoll veröffentlichen.",
  keywords: keywordsFor("benchmark"),
  alternates: {
    canonical: "/at/benchmark-methodology",
    languages: {
      "de-AT": "/at/benchmark-methodology",
      "de-DE": "/de/benchmark-methodology",
      "x-default": "/at/benchmark-methodology",
    },
  },
  openGraph: {
    title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
    description:
      "Wie die Suche arbeitet und warum wir eine Trefferquote erst mit nachprüfbarem Messprotokoll veröffentlichen.",
    url: "/at/benchmark-methodology",
    type: "website",
  },
};

export default function BenchmarkMethodologyRoute() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Benchmark-Methodik", url: "/at/benchmark-methodology" },
        ])}
      />
      <BenchmarkMethodologyPage />
    </>
  );
}
