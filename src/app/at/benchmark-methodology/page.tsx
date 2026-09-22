import type { Metadata } from "next";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import BenchmarkMethodologyPage from "@/components/marketing/benchmark-methodology-page";

export const metadata: Metadata = {
  title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
  description:
    "Eine belegte Kennzahl, offen beschrieben: In einem öffentlichen Test mit 500 Fragen (LongMemEval) lag die richtige Textstelle in 99,8 % der Fälle unter den ersten acht Treffern. Mit Grenzen der Aussage.",
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
      "Was Subsumio gemessen hat, was die Zahl bedeutet und was sie nicht bedeutet: 99,8 % Trefferquote beim Auffinden der richtigen Stelle (LongMemEval, 500 Fragen).",
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
