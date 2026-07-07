import type { Metadata } from "next";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import BenchmarkMethodologyPage from "@/components/marketing/benchmark-methodology-page";

export const metadata: Metadata = {
  title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
  description:
    "Transparente Benchmark-Methodik für KI-Kanzleisoftware: Recall@5 Retrieval-Benchmark, Hallucination-Rate, End-to-End-Latenz. Reproduzierbare Tests, DACH-Rechtsgebiete, offene Methodik.",
  keywords: keywordsFor("benchmark"),
  alternates: {
    canonical: "/benchmark-methodology",
    languages: {
      "de-DE": "/benchmark-methodology",
      "de-AT": "/benchmark-methodology",
      "de-CH": "/benchmark-methodology",
    },
  },
  openGraph: {
    title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
    description:
      "Transparente Benchmark-Methodik für KI-Kanzleisoftware: Recall@5, Hallucination-Rate, End-to-End-Latenz. Reproduzierbar, DACH-Rechtsgebiete.",
    url: "/benchmark-methodology",
    type: "website",
  },
};

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

export default function BenchmarkMethodologyRoute() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Benchmark-Methodik", url: "/benchmark-methodology" },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "Subsumio Retrieval Benchmark — DACH Legal Corpus",
          description:
            "Retrieval benchmark for AI legal software covering Austrian, German and Swiss law. Measures Recall@5, hallucination rate and end-to-end latency across 500+ legal queries.",
          url: `${BASE}/benchmark-methodology`,
          creator: { "@type": "Organization", name: "Subsumio" },
          license: "https://creativecommons.org/licenses/by/4.0/",
          isAccessibleForFree: true,
          keywords: [
            "retrieval benchmark",
            "legal AI",
            "Recall@5",
            "hallucination rate",
            "DACH law",
          ],
          distribution: [
            {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: `${BASE}/benchmark-methodology`,
            },
          ],
          variableMeasured: [
            { "@type": "PropertyValue", name: "Recall@5", value: "97.9%" },
            { "@type": "PropertyValue", name: "Hallucination rate", value: "< 2%" },
            { "@type": "PropertyValue", name: "End-to-end latency (p95)", value: "< 3s" },
          ],
        }}
      />
      <BenchmarkMethodologyPage />
    </>
  );
}
