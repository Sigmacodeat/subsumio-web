"use client";

import { Shield, Brain, Globe, Heart } from "lucide-react";
import { p, type Lang } from "@/content/site";
import { Section, SectionHeading, PageHero, CTASection, ContentCard } from "./chrome";
import { AnimatedCounter, Reveal, StaggerContainer, StaggerItem } from "./motion-system";

const _deAbout = {
  badge: "Über Subsumio",
  h1a: "Aus Österreich",
  h1b: "für DACH-Kanzleien.",
  sub: "Subsumio ist die Kanzleisoftware mit Assistent, gebaut für die Verschwiegenheit, Präzision und regulatorischen Anforderungen von Kanzleien in Österreich, Deutschland und der Schweiz.",
  missionTitle: "Unsere Mission",
  missionText:
    "Jeder Kanzlei eine Wissensbasis geben, die nie vergisst — jede Akte, Frist und Schriftsatz indiziert und abfragbar, mit Zitaten, die du überprüfen kannst, bevor du dich darauf verlässt. Auf Infrastruktur, die du kontrollierst — nicht auf fremder Cloud.",
  valuesTitle: "Woran wir glauben",
  values: [
    {
      icon: "Shield",
      title: "Vertraulichkeit per Architektur",
      desc: "Mandantendaten sind heilig. Self-hosted oder EU-gehostet, verschlüsselt und isoliert — nie zum Training geteilter Modelle, nie außerhalb deiner Kontrolle.",
    },
    {
      icon: "Brain",
      title: "Zitate, nicht Halluzinationen",
      desc: "Jede Antwort des Assistenten nennt ihre Quelle. Anwälte verifizieren mit einem Klick. Keine halluzinierten Referenzen, keine Black-Box-Outputs.",
    },
    {
      icon: "Globe",
      title: "DACH-first, nicht US-first",
      desc: "Gebaut für ZPO, BGB, ABGB, beA, DATEV. Wir verstehen die DACH-Rechtslandschaft, weil wir darin leben.",
    },
    {
      icon: "Heart",
      title: "Für Anwälte gemacht",
      desc: "Tools, die deine Anwälte täglich nutzen — WhatsApp-Copilot, Sprachnotizen, mobil. Nicht ein weiteres System, das sie meiden.",
    },
  ],
  statsTitle: "In Zahlen",
  stats: [
    { value: "14.713", label: "Gesetzesparagraphen, zitierbar" },
    { value: "3", label: "Jurisdiktionen — AT · DE · CH" },
    { value: "97,9 %", label: "Recall@5 Retrieval-Benchmark" },
    { value: "0", label: "Mandantendaten-Leaks — garantiert" },
  ],
  ctaTitle: "Sprich mit uns",
  ctaSub: "Ob Einzelanwalt oder Managing Partner — wir freuen uns, von dir zu hören.",
  ctaButton: "Kontakt aufnehmen",
} as const;

const CONTENT = {
  en: {
    badge: "About Subsumio",
    h1a: "Built in Austria",
    h1b: "for DACH law.",
    sub: "Subsumio is the AI legal software company built for the confidentiality, precision and regulatory demands of law firms in Austria, Germany and Switzerland.",
    missionTitle: "Our mission",
    missionText:
      "Give every law firm a brain that never forgets — every matter, deadline and brief indexed and answerable, with citations you can verify before you rely on them. Built on infrastructure you control, not someone else's cloud.",
    valuesTitle: "What we believe",
    values: [
      {
        icon: "Shield",
        title: "Confidentiality by architecture",
        desc: "Client data is sacred. Self-hosted or EU-hosted, encrypted and isolated — never used to train shared models, never leaving your control.",
      },
      {
        icon: "Brain",
        title: "Citations, not hallucinations",
        desc: "Every AI answer names its source. Lawyers verify in one click. No hallucinated references, no black-box outputs.",
      },
      {
        icon: "Globe",
        title: "DACH-first, not US-first",
        desc: "Built for ZPO, BGB, ABGB, beA, DATEV. We understand the DACH legal landscape because we live in it.",
      },
      {
        icon: "Heart",
        title: "Lawyer-centric design",
        desc: "Tools your lawyers actually use daily — WhatsApp copilot, voice notes, mobile-first. Not another system they avoid.",
      },
    ],
    statsTitle: "By the numbers",
    stats: [
      { value: "14,713", label: "Statute paragraphs, citable" },
      { value: "3", label: "Jurisdictions — AT · DE · CH" },
      { value: "97.9%", label: "Recall@5 retrieval benchmark" },
      { value: "0", label: "Client-data leaks, by design" },
    ],
    ctaTitle: "Talk to us",
    ctaSub: "Whether you're a solo lawyer or managing partner — we'd love to hear from you.",
    ctaButton: "Get in touch",
  },
  de: _deAbout,
  at: _deAbout,
  ch: _deAbout,
};

const ICON_MAP = { Shield, Brain, Globe, Heart };

export default function AboutPage({ lang }: { lang: Lang }) {
  const c = (CONTENT as unknown as Record<string, typeof CONTENT.de>)[lang] ?? CONTENT.de;
  return (
    <>
      <PageHero badge={c.badge} h1a={c.h1a} h1b={c.h1b} sub={c.sub} />

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
          <StaggerContainer className="grid gap-4 sm:grid-cols-2" stagger={0.08}>
            {c.values.map((v) => {
              const Icon = ICON_MAP[v.icon as keyof typeof ICON_MAP] ?? Brain;
              return (
                <StaggerItem key={v.title}>
                  <ContentCard icon={Icon} title={v.title} desc={v.desc} />
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </Section>

      <Section tone="dark" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.statsTitle} tone="dark" />
          <StaggerContainer className="grid grid-cols-2 gap-6 md:grid-cols-4" stagger={0.06}>
            {c.stats.map((s) => {
              const num = parseFloat(s.value.replace(/[^0-9.]/g, ""));
              const suffix = s.value.replace(/[0-9.,]/g, "");
              const prefix = s.value.match(/^[^0-9]*/)?.[0] ?? "";
              const isNumeric = !isNaN(num) && num > 0;
              return (
                <StaggerItem key={s.label} className="text-center">
                  <div className="brand-text text-3xl font-bold md:text-4xl">
                    {isNumeric ? (
                      <AnimatedCounter
                        to={num}
                        prefix={prefix}
                        suffix={suffix}
                        decimals={s.value.includes(".") ? 1 : 0}
                      />
                    ) : (
                      s.value
                    )}
                  </div>
                  <div className="mt-1 text-xs [color:var(--mk-text-muted)]">{s.label}</div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </Section>

      <CTASection
        title={c.ctaTitle}
        sub={c.ctaSub}
        href={p(lang, "/contact")}
        label={c.ctaButton}
      />
    </>
  );
}
