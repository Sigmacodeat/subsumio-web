import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentFor, pBind, type Market } from "@/lib/market";
import { TRIAL_DAYS } from "@/lib/billing/credit-constants";
import { Section, SectionHeading, CTASection, PageHero } from "./primitives";
import { Reveal, GlowCard } from "./motion-system";
import { IllusCitationWeb } from "./brand-illustrations";

// No published figure. A retrieval number may only appear once a measurement
// with the product configuration (embedding model, search mode, date, commit)
// is checked in under docs/eval and linked here. Until then the page describes
// the method and how answers can be checked — see src/content/proof-points.ts.
const STATUS = {
  title: "Derzeit keine veröffentlichte Kennzahl",
  desc: "Wir nennen eine Trefferquote erst, wenn ein nachprüfbares Messprotokoll mit der Konfiguration vorliegt, mit der Subsumio tatsächlich arbeitet – Datum, Version, Suchverfahren und Ergebnisse je Frage. Bis dahin beschreiben wir hier, wie die Suche arbeitet und wie Sie Antworten selbst prüfen.",
};

const LIMITATION_ITEMS = [
  "Allgemeine Tests für KI-Gedächtnis sind keine juristischen Tests; ihre Fragen stammen nicht aus österreichischen oder deutschen Akten.",
  "Eine Trefferquote misst das Auffinden der richtigen Textstelle — nicht die Qualität der daraus formulierten Antwort und nicht ihre rechtliche Richtigkeit.",
  "Auf Ihren Akten können Ergebnisse abweichen, etwa bei schlecht lesbaren Scans oder sehr ähnlichen Dokumenten.",
  "Die anwaltliche Prüfung jeder Antwort bleibt notwendig.",
];

const METHOD_ITEMS = [
  "Suche: Sinnsuche (Embeddings) und Stichwortsuche werden kombiniert und um die erkannten Zusammenhänge zwischen Personen, Akten und Dokumenten ergänzt.",
  "Fundstellen: Antworten verweisen auf Dokument und Stelle bzw. auf die Gesetzesstelle; Zitate werden gegen die hinterlegten Rechtsquellen geprüft, nicht Belegtes wird gekennzeichnet.",
  "Lücken: Findet die Suche nichts Passendes, sagt der Assistent das, statt eine unbelegte Antwort zu geben.",
];

export default function BenchmarkMethodologyPage({ market = "at" }: { market?: Market }) {
  const { ui: UI_STRINGS } = contentFor(market);
  const p = pBind(market);

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
        sub="Wie die Suche arbeitet – und warum wir derzeit keine Trefferquote veröffentlichen."
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
            <SectionHeading title="Kennzahlen" />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <GlowCard className="mt-8 rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
              <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">{STATUS.title}</h3>
              <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{STATUS.desc}</p>
              <h3 className="mt-6 mb-2 text-sm font-semibold [color:var(--mk-text)]">
                Was eine Trefferquote nicht sagt
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
            <SectionHeading title="So arbeitet die Suche" />
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
        sub={`Starten Sie Ihre ${TRIAL_DAYS}-tägige Testphase — keine Kreditkarte nötig.`}
        href={p("/signup")}
        label={`${TRIAL_DAYS} Tage kostenlos testen`}
        secondaryHref={p("/contact")}
        secondaryLabel={UI_STRINGS.writeUs}
      />
    </div>
  );
}
