import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { p, UI_STRINGS } from "@/content/site";
import { PROOF } from "@/content/proof-points";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading, PageHero, CTASection, ContentCard, StatCard } from "./primitives";
import { Reveal, StaggerContainer, StaggerItem } from "./motion-system";
import { IllusOrigin } from "./brand-illustrations";

const CONTENT = {
  badge: "Über Subsumio",
  h1a: "Aus Österreich",
  h1b: "für österreichische Kanzleien.",
  sub: "Subsumio ist die Kanzleisoftware mit Assistent, gebaut für die Verschwiegenheit, Präzision und regulatorischen Anforderungen österreichischer Kanzleien.",
  missionTitle: "Unsere Mission",
  missionText:
    "Jeder Kanzlei eine Wissensbasis geben, die nie vergisst — jede Akte, Frist und Schriftsatz indiziert und abfragbar, mit Zitaten, die Sie überprüfen können, bevor du dich darauf verlässt. Auf Infrastruktur, die du kontrollierst — nicht auf fremder Cloud.",
  valuesTitle: "Woran wir glauben",
  values: [
    {
      icon: "Shield",
      title: "Vertraulichkeit per Architektur",
      desc: "Mandantendaten sind heilig. Self-hosted oder EU-gehostet, verschlüsselt und isoliert — nie zum Training geteilter Modelle, nie außerhalb Ihrer Kontrolle.",
    },
    {
      icon: "Brain",
      title: "Zitate, nicht Halluzinationen",
      desc: "Jede Antwort des Assistenten nennt ihre Quelle. Anwälte verifizieren mit einem Klick. Keine halluzinierten Referenzen, keine Black-Box-Outputs.",
    },
    {
      icon: "Globe",
      title: "Österreich-first",
      desc: "Gebaut für ZPO, ABGB, RAO, RATG und webERV. Der Startfokus ist bewusst Österreich — fachlich klar statt oberflächlich mehrsprachig.",
    },
    {
      icon: "Heart",
      title: "Für Anwälte gemacht",
      desc: "Werkzeuge, die Ihre Anwältinnen und Anwälte täglich nutzen — WhatsApp-Copilot, Sprachnotizen, mobil. Nicht ein weiteres System, das sie meiden.",
    },
  ],
  statsTitle: "In Zahlen",
  stats: [
    { value: "14.713", label: "Gesetzesparagraphen, zitierbar" },
    { value: "1", label: "Startjurisdiktion — Österreich" },
    {
      value: PROOF.recall8.value,
      label: `${PROOF.recall8.metric} Retrieval-Benchmark (${PROOF.recall8.benchmark}, ${PROOF.recall8.sampleSize} Fragen)`,
    },
    { value: "0", label: "Mandantendaten-Leaks — garantiert" },
  ],
  ctaTitle: "Sprich mit uns",
  ctaSub: "Ob Einzelanwalt oder Managing Partner — wir freuen uns, von Ihnen zu hören.",
  ctaButton: "Kontakt aufnehmen",
} as const;

export default function AboutPage() {
  const c = CONTENT;
  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      <PageHero
        badge={c.badge}
        h1a={c.h1a}
        h1b={c.h1b}
        sub={c.sub}
        actions={
          <>
            <Button size="lg" variant="primary" asChild>
              <Link href={p("/signup")}>
                {UI_STRINGS.startFree} <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={p("/superbrain")}>{UI_STRINGS.watchDemo}</Link>
            </Button>
          </>
        }
        visual={<IllusOrigin />}
      />

      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeading title={c.missionTitle} tone="light" />
          <Reveal variant="up" delay={0.1}>
            <p className="mx-auto max-w-3xl text-center text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
              {c.missionText}
            </p>
          </Reveal>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={c.valuesTitle} tone="light" />
          <StaggerContainer className="grid gap-6 sm:grid-cols-2" stagger={0.08}>
            {c.values.map((v) => (
              <StaggerItem key={v.title}>
                <ContentCard icon={v.icon} title={v.title} desc={v.desc} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      <Section tone="dark" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.statsTitle} tone="dark" />
          <StaggerContainer className="grid grid-cols-2 gap-6 md:grid-cols-4" stagger={0.06}>
            {c.stats.map((s) => (
              <StaggerItem key={s.label} className="text-center">
                <StatCard value={s.value} label={s.label} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      <CTASection
        title={c.ctaTitle}
        sub={c.ctaSub}
        href={p("/contact")}
        label={c.ctaButton}
        secondaryHref={p("/signup")}
        secondaryLabel={UI_STRINGS.startFree}
      />
    </div>
  );
}
