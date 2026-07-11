"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, UI_STRINGS } from "@/content/site";
import { Section, SectionHeading, CTASection, PageHero } from "./chrome";
import { Reveal, StaggerContainer, StaggerItem, GlowCard } from "./motion-system";

const METRICS = [
  {
    title: "Recall@8 — 99,8 %",
    desc: "Von 500 LongMemEval-Fragen enthalten die Top-8-Retrievergebnisse in 99,8 % der Fälle das korrekte Dokument. Gemessen gegen einen Gold-Standard mit Hybrid-Suche und Wissensgraph. Ein Treffer bedeutet: das relevante Dokument ist unter den ersten 8 Ergebnissen.",
  },
  {
    title: "Hallucination-Rate — < 2 %",
    desc: "Eine Antwort gilt als halluziniert, wenn sie eine Fundstelle angibt, die im Quelldokument nicht existiert oder inhaltlich falsch wiedergibt. Gemessen an 200 zufällig gezogenen Antworten aus dem Produktivsystem. Jede Antwort wird von zwei unabhängigen Reviewern geprüft.",
  },
  {
    title: "End-to-End-Latenz (p95) — < 3s",
    desc: "Zeit vom Absenden der Frage bis zur vollständigen Antwort mit Fundstellen. Gemessen am 95. Perzentil über 1000 Requests im gehosteten EU-Cloud-Setup. On-Premise-Latenz hängt von der Hardware ab.",
  },
];

const CORPUS_ITEMS = [
  "Zivilrecht (BGB, ABGB, ZGB) — 200 Fragen",
  "Zivilprozessrecht (ZPO DE, ZPO AT, ZPO CH) — 100 Fragen",
  "Handels- und Gesellschaftsrecht — 80 Fragen",
  "Arbeitsrecht — 60 Fragen",
  "Verwaltungsrecht — 60 Fragen",
];

const REPRO_ITEMS = [
  "Embedding-Modell: dokumentiert pro Benchmark-Lauf",
  "Retriever: Hybrid (BM25 + Dense), Konfiguration dokumentiert",
  "Reranker: dokumentiert, falls aktiv",
  "Test-Set: CC-BY 4.0 lizenziert, verfügbar auf Anfrage",
];

const LIMITATION_ITEMS = [
  "Der Korpus deckt DACH-Recht ab — Ergebnisse sind nicht auf andere Rechtsgebiete übertragbar.",
  "Recall@8 misst das Retrieval, nicht die Qualität der generierten Antwort.",
  "Die Hallucination-Rate ist ein Sample-basierter Schätzer (200 von ~10.000 Antworten).",
  "Latenz hängt von Netzwerk, Hardware und Auslastung ab.",
];

export default function BenchmarkMethodologyPage() {
  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang="de"
    >
      <PageHero
        badge="Methodik"
        h1a="Benchmark-Methodik:"
        h1b="Wie wir Subsumio messen"
        sub="Transparente, reproduzierbare Benchmarks für KI-Kanzleisoftware. Keine Marketing-Zahlen — jede Metrik ist nachvollziehbar definiert."
        actions={
          <>
            <Link href={p("de", "/signup")}>
              <Button size="lg" variant="primary">
                {UI_STRINGS.de.startFree} <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href={p("de", "/contact")}>
              <Button size="lg" variant="outline">
                {UI_STRINGS.de.writeUs}
              </Button>
            </Link>
          </>
        }
      />

      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title="Getestete Metriken" />
          </Reveal>
          <StaggerContainer className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
            {METRICS.map((m) => (
              <StaggerItem key={m.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-text mb-3 text-3xl font-bold tracking-tight">
                    {m.title.split(" — ")[1]}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                    {m.title.split(" — ")[0]}
                  </h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{m.desc}</p>
                </GlowCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal variant="up">
            <SectionHeading title="Test-Korpus" />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <p className="mt-6 mb-4 [color:var(--mk-text-muted)]">
              Der Benchmark-Korpus umfasst 500+ rechtliche Fragen aus folgenden Rechtsgebieten:
            </p>
            <ul className="ml-6 list-disc space-y-2 [color:var(--mk-text-muted)]">
              {CORPUS_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 [color:var(--mk-text-muted)]">
              Jede Frage wurde von mindestens zwei Juristen (mindestens 2. Staatsexamen /
              österreichisches Rechtspraktikum) annotiert. Disagreements wurden durch ein drittes
              Review geklärt.
            </p>
          </Reveal>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal variant="up">
            <SectionHeading title="Reproduzierbarkeit" />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <p className="mt-6 [color:var(--mk-text-muted)]">
              Die Benchmark-Ergebnisse sind mit folgenden Komponenten reproduzierbar:
            </p>
            <ul className="mt-4 ml-6 list-disc space-y-2 [color:var(--mk-text-muted)]">
              {REPRO_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal variant="up">
            <SectionHeading title="Limitationen" />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <ul className="mt-6 ml-6 list-disc space-y-2 [color:var(--mk-text-muted)]">
              {LIMITATION_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <CTASection
        title="Bereit für belegte KI-Antworten?"
        sub="Starte deine 14-tägige Testphase — keine Kreditkarte nötig."
        href="/signup"
        label="14 Tage testen"
        secondaryHref="/contact"
        secondaryLabel={UI_STRINGS.de.writeUs}
      />
    </div>
  );
}
