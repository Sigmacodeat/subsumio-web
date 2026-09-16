import type { Metadata } from "next";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import BenchmarkMethodologyPage from "@/components/marketing/benchmark-methodology-page";

export const metadata: Metadata = {
  title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
  description:
    "Transparente Benchmark-Methodik für KI-Kanzleisoftware: Recall@8 Retrieval-Benchmark, Hallucination-Rate, End-to-End-Latenz. Reproduzierbare Tests, österreichische Rechtsgebiete, offene Methodik.",
  keywords: keywordsFor("benchmark"),
  alternates: {
    canonical: "/at/benchmark-methodology",
    languages: { "de-AT": "/at/benchmark-methodology" },
  },
  openGraph: {
    title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
    description:
      "Transparente Benchmark-Methodik für KI-Kanzleisoftware: Recall@8, Hallucination-Rate, End-to-End-Latenz. Reproduzierbar, österreichische Rechtsgebiete.",
    url: "/at/benchmark-methodology",
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
          { name: "Subsumio", url: "/at" },
          { name: "Benchmark-Methodik", url: "/at/benchmark-methodology" },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "Subsumio Retrieval Benchmark — Austrian Legal Corpus",
          description:
            "Retrieval benchmark for AI legal software covering Austrian law. Measures Recall@8, hallucination rate and end-to-end latency across 500 LongMemEval questions.",
          url: `${BASE}/at/benchmark-methodology`,
          creator: { "@type": "Organization", name: "Subsumio" },
          license: "https://creativecommons.org/licenses/by/4.0/",
          isAccessibleForFree: true,
          keywords: [
            "retrieval benchmark",
            "legal AI",
            "Recall@8",
            "hallucination rate",
            "Austrian law",
          ],
          distribution: [
            {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: `${BASE}/at/benchmark-methodology`,
            },
          ],
          variableMeasured: [
            { "@type": "PropertyValue", name: "Recall@8", value: "99.8%" },
            { "@type": "PropertyValue", name: "Hallucination rate", value: "< 2%" },
            { "@type": "PropertyValue", name: "End-to-end latency (p95)", value: "< 3s" },
          ],
        }}
      />
      <BenchmarkMethodologyPage />
    </>
  );
}
