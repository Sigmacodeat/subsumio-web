import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, UI_STRINGS } from "@/content/site";
import { PROOF } from "@/content/proof-points";
import { Section, SectionHeading, CTASection, PageHero } from "./primitives";
import { Reveal, GlowCard } from "./motion-system";
import { IllusCitationWeb } from "./brand-illustrations";

// ONE documented figure. LongMemEval is a public, non-legal memory benchmark;
// the value measures retrieval (finding the passage), not answer quality.
// Unsourced figures (hallucination rate, latency, an Austrian test corpus with
// annotators) were removed — do not re-add numbers without a published source.
const METRIC = {
  value: PROOF.recall8.value,
  title: `Trefferquote unter den ersten acht Treffern (${PROOF.recall8.metric})`,
  desc: `Von ${PROOF.recall8.sampleSize} Fragen des öffentlichen Tests ${PROOF.recall8.benchmark} lag die richtige Textstelle in ${PROOF.recall8.value} der Fälle unter den ersten acht Treffern der Suche. „${PROOF.recall8.metric}“ bedeutet genau das: der Anteil der Fragen, bei denen die gesuchte Stelle unter den ersten acht Ergebnissen ist.`,
};

const LIMITATION_ITEMS = [
  `${PROOF.recall8.benchmark} ist ein öffentlicher Test für das Langzeitgedächtnis von KI-Assistenten — kein juristischer Test. Die Fragen stammen nicht aus österreichischen Akten.`,
  "Gemessen wird das Auffinden der richtigen Textstelle — nicht die Qualität der daraus formulierten Antwort und nicht ihre rechtliche Richtigkeit.",
  "Auf Ihren Akten können die Ergebnisse abweichen, etwa bei schlecht lesbaren Scans oder sehr ähnlichen Dokumenten.",
  "Die anwaltliche Prüfung jeder Antwort bleibt notwendig.",
];

const METHOD_ITEMS = [
  `Datensatz: ${PROOF.recall8.benchmark}, ${PROOF.recall8.sampleSize} Fragen, öffentlich verfügbar.`,
  "Suche: Sinnsuche (Embeddings) und Stichwortsuche (BM25) werden kombiniert und um die erkannten Zusammenhänge zwischen Personen, Akten und Dokumenten ergänzt.",
  "Treffer: Eine Frage zählt als gefunden, wenn die im Datensatz hinterlegte richtige Stelle unter den ersten acht Ergebnissen ist.",
  "Protokoll: Suchverfahren und Einstellungen werden je Messlauf festgehalten.",
];

export default function BenchmarkMethodologyPage() {
  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang="de-AT"
    >
      <PageHero
        badge="Methodik"
        h1a="Benchmark-Methodik:"
        h1b="Wie wir Subsumio messen"
        sub="Eine belegte Kennzahl, offen beschrieben – samt ihren Grenzen."
        actions={
          <>
            <Button size="lg" variant="primary" asChild>
              <Link href={p("/signup")}>
                {UI_STRINGS.startFree} <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={p("/contact")}>{UI_STRINGS.writeUs}</Link>
            </Button>
          </>
        }
        visual={<IllusCitationWeb />}
      />

      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal variant="up">
            <SectionHeading title="Die Kennzahl" />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <GlowCard className="mt-8 rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
              <div className="brand-text mb-3 text-3xl font-bold tracking-tight">
                {METRIC.value}
              </div>
              <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">{METRIC.title}</h3>
              <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{METRIC.desc}</p>
              {/* Limitations sit directly under the number, not at the page end. */}
              <h3 className="mt-6 mb-2 text-sm font-semibold [color:var(--mk-text)]">
                Was die Zahl nicht sagt
              </h3>
              <ul className="ml-6 list-disc space-y-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                {LIMITATION_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </GlowCard>
          </Reveal>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal variant="up">
            <SectionHeading title="So wurde gemessen" />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <ul className="mt-6 ml-6 list-disc space-y-2 [color:var(--mk-text-muted)]">
              {METHOD_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <CTASection
        title="Sehen Sie es an Ihren eigenen Akten."
        sub="Starten Sie Ihre 14-tägige Testphase — keine Kreditkarte nötig."
        href="/at/signup"
        label="30 Tage kostenlos testen"
        secondaryHref="/at/contact"
        secondaryLabel={UI_STRINGS.writeUs}
      />
    </div>
  );
}
