import type { Metadata } from "next";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { keywordsFor } from "@/lib/seo-keywords";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Benchmark-Methodik — Subsumio KI-Kanzleisoftware",
  description:
    "Transparente Benchmark-Methodik für KI-Kanzleisoftware: Recall@5 Retrieval-Benchmark, Hallucination-Rate, End-to-End-Latenz. Reproduzierbare Tests, DACH-Rechtsgebiete, offene Methodik.",
  keywords: keywordsFor("benchmark"),
  alternates: {
    canonical: "/benchmark-methodology",
    languages: { de: "/benchmark-methodology", en: "/en/benchmark-methodology" },
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

export default function BenchmarkMethodologyPage() {
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
      <article className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mb-12">
          <span
            className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-text)]"
            style={{ background: "color-mix(in srgb, var(--brand-text) 10%, transparent)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-text)]" />
            Methodik
          </span>
          <h1 className="mb-4 text-4xl font-black [color:var(--mk-text)]">
            Benchmark-Methodik: Wie wir Subsumio messen
          </h1>
          <p className="text-lg [color:var(--mk-text-muted)]">
            Transparente, reproduzierbare Benchmarks für KI-Kanzleisoftware. Keine Marketing-Zahlen
            — jede Metrik ist nachvollziehbar definiert.
          </p>
        </div>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">Getestete Metriken</h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                Recall@5 — 97,9 %
              </h3>
              <p className="text-[color:var(--mk-text-muted)]">
                Von 500 rechtlichen Fragen (AT/DE/CH) enthalten die Top-5-Retrievergebnisse in 97,9
                % der Fälle das korrekte Dokument. Gemessen gegen ein Gold-Standard-Set, das von
                Juristen annotiert wurde. Ein Treffer bedeutet: das relevante Dokument ist unter den
                ersten 5 Ergebnissen.
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                Hallucination-Rate — &lt; 2 %
              </h3>
              <p className="text-[color:var(--mk-text-muted)]">
                Eine Antwort gilt als halluziniert, wenn sie eine Fundstelle angibt, die im
                Quelldokument nicht existiert oder inhaltlich falsch wiedergibt. Gemessen an 200
                zufällig gezogenen Antworten aus dem Produktivsystem. Jede Antwort wird von zwei
                unabhängigen Reviewern geprüft.
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                End-to-End-Latenz (p95) — &lt; 3s
              </h3>
              <p className="text-[color:var(--mk-text-muted)]">
                Zeit vom Absenden der Frage bis zur vollständigen Antwort mit Fundstellen. Gemessen
                am 95. Perzentil über 1000 Requests im gehosteten EU-Cloud-Setup. On-Premise-Latenz
                hängt von der Hardware ab.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">Test-Korpus</h2>
          <p className="mb-4 text-[color:var(--mk-text-muted)]">
            Der Benchmark-Korpus umfasst 500+ rechtliche Fragen aus folgenden Rechtsgebieten:
          </p>
          <ul className="ml-6 list-disc space-y-2 text-[color:var(--mk-text-muted)]">
            <li>Zivilrecht (BGB, ABGB, ZGB) — 200 Fragen</li>
            <li>Zivilprozessrecht (ZPO DE, ZPO AT, ZPO CH) — 100 Fragen</li>
            <li>Handels- und Gesellschaftsrecht — 80 Fragen</li>
            <li>Arbeitsrecht — 60 Fragen</li>
            <li>Verwaltungsrecht — 60 Fragen</li>
          </ul>
          <p className="mt-4 text-[color:var(--mk-text-muted)]">
            Jede Frage wurde von mindestens zwei Juristen (mindestens 2. Staatsexamen /
            österreichisches Rechtspraktikum) annotiert. Disagreements wurden durch ein drittes
            Review geklärt.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">Reproduzierbarkeit</h2>
          <p className="text-[color:var(--mk-text-muted)]">
            Die Benchmark-Ergebnisse sind mit folgenden Komponenten reproduzierbar:
          </p>
          <ul className="mt-4 ml-6 list-disc space-y-2 text-[color:var(--mk-text-muted)]">
            <li>Embedding-Modell: dokumentiert pro Benchmark-Lauf</li>
            <li>Retriever: Hybrid (BM25 + Dense), konfiguration dokumentiert</li>
            <li>Reranker: dokumentiert, falls aktiv</li>
            <li>Test-Set: CC-BY 4.0 lizenziert, verfügbar auf Anfrage</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">Limitationen</h2>
          <ul className="ml-6 list-disc space-y-2 text-[color:var(--mk-text-muted)]">
            <li>
              Der Korpus deckt DACH-Recht ab — Ergebnisse sind nicht auf andere Rechtsgebiete
              übertragbar.
            </li>
            <li>Recall@5 misst das Retrieval, nicht die Qualität der generierten Antwort.</li>
            <li>
              Die Hallucination-Rate ist ein Sample-basierter Schätzer (200 von ~10.000 Antworten).
            </li>
            <li>Latenz hängt von Netzwerk, Hardware und Auslastung ab.</li>
          </ul>
        </section>

        <div className="mt-12 flex flex-wrap gap-4">
          <Link
            href="/features"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Features im Überblick
          </Link>
          <Link
            href="/pricing"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Preise & Pläne
          </Link>
          <Link
            href="/security"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Sicherheit & § 203 StGB
          </Link>
        </div>
      </article>
    </>
  );
}
