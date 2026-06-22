"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Brain, Globe, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import { Section, SectionHeading } from "./chrome";

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
  de: {
    badge: "Über Subsumio",
    h1a: "Aus Österreich",
    h1b: "für DACH-Kanzleien.",
    sub: "Subsumio ist die Kanzleisoftware mit Assistent, gebaut für die Verschwiegenheit, Präzision und regulatorischen Anforderungen von Kanzleien in Österreich, Deutschland und der Schweiz.",
    missionTitle: "Unsere Mission",
    missionText:
      "Jeder Kanzlei eine Wissensbasis geben, die nie vergisst — jede Akte, Frist und Schriftsatz indiziert und abfragbar, mit Zitaten, die du überprüfen kannst, bevor du dich darauf verlässt. Auf Infrastruktur, die du kontrollierst, nicht fremder Cloud.",
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
        title: "Anwalt-zentriertes Design",
        desc: "Tools, die deine Anwälte täglich nutzen — WhatsApp-Copilot, Sprachnotizen, Mobile-First. Nicht ein weiteres System, das sie meiden.",
      },
    ],
    statsTitle: "In Zahlen",
    stats: [
      { value: "14.713", label: "Gesetzesparagraphen, zitierbar" },
      { value: "3", label: "Jurisdiktionen — AT · DE · CH" },
      { value: "97,9 %", label: "Recall@5 Retrieval-Benchmark" },
      { value: "0", label: "Mandantendaten-Leaks, by Design" },
    ],
    ctaTitle: "Sprich mit uns",
    ctaSub: "Ob Einzelanwalt oder Managing Partner — wir freuen uns, von dir zu hören.",
    ctaButton: "Kontakt aufnehmen",
  },
};

const ICON_MAP = { Shield, Brain, Globe, Heart };

export default function AboutPage({ lang }: { lang: Lang }) {
  const c = CONTENT[lang];
  return (
    <>
      <Section tone="light" className="px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.span
            className="brand-soft brand-text brand-border mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <span className="brand-bg badge-pulse h-1.5 w-1.5 rounded-full" />
            {c.badge}
          </motion.span>
          <motion.h1
            className="text-4xl font-black tracking-tight [color:var(--mk-text)] md:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            {c.h1a}
            <br />
            <span className="brand-text">{c.h1b}</span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
          >
            {c.sub}
          </motion.p>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeading title={c.missionTitle} tone="light" />
          <motion.p
            className="mx-auto max-w-3xl text-center text-lg leading-relaxed [color:var(--mk-text-muted)]"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            {c.missionText}
          </motion.p>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={c.valuesTitle} tone="light" />
          <div className="grid gap-4 sm:grid-cols-2">
            {c.values.map((v, i) => {
              const Icon = ICON_MAP[v.icon as keyof typeof ICON_MAP] ?? Brain;
              return (
                <motion.div
                  key={v.title}
                  className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.45, delay: i * 0.08 }}
                >
                  <div className="brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                    <Icon size={22} className="brand-text" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">{v.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{v.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Section>

      <Section tone="dark" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.statsTitle} tone="dark" />
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {c.stats.map((s, i) => (
              <motion.div
                key={s.label}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
              >
                <div className="brand-text text-3xl font-black md:text-4xl">{s.value}</div>
                <div className="mt-1 text-xs [color:var(--mk-text-muted)]">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 text-3xl font-black tracking-tight [color:var(--mk-text)] md:text-4xl">
            {c.ctaTitle}
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg [color:var(--mk-text-muted)]">{c.ctaSub}</p>
          <Link href={p(lang, "/contact")}>
            <Button size="lg" variant="glow" className="group min-h-[48px]">
              {c.ctaButton}
              <ArrowRight
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Button>
          </Link>
        </motion.div>
      </Section>
    </>
  );
}
