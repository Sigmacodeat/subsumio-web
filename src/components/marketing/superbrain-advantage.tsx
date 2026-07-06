"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileSearch, LockKeyhole, ShieldCheck } from "lucide-react";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import { Button } from "@/components/ui/button";
import { H2_CTA_CLASS } from "./chrome";

const copy = {
  en: {
    eyebrow: "Why lawyers trust Subsumio",
    title: "Three promises — not marketing, architecture.",
    sub: "Trust isn't a feature. It's the foundation.",
    pillars: [
      {
        icon: LockKeyhole,
        title: "Silent by design",
        desc: "Confidentiality by architecture, not promise. § 203 StGB, § 9 RAO, BGFA — no third party processes client data.",
      },
      {
        icon: FileSearch,
        title: "Cites what it says",
        desc: "Every answer with citations from your matters. No hallucinations, no black box — or Subsumio says honestly: 'No answer.'",
      },
      {
        icon: ShieldCheck,
        title: "Stays where you want",
        desc: "On-premise on your hardware or EU cloud with DPA. Your data, your keys, your control.",
      },
    ],
    cta: "Explore features",
  },
  de: {
    eyebrow: "Warum Anwälte Subsumio vertrauen",
    title: "Drei Versprechen — keine Marketingworte, sondern Architektur.",
    sub: "Vertrauen ist kein Feature. Es ist die Grundlage.",
    pillars: [
      {
        icon: LockKeyhole,
        title: "Schweigt für sich",
        desc: "Verschwiegenheit per Architektur, nicht per Versprechen. § 203 StGB, § 9 RAO, BGFA — kein Dritter verarbeitet Mandantendaten.",
      },
      {
        icon: FileSearch,
        title: "Belegt, was es sagt",
        desc: "Jede Antwort mit Fundstellen aus deinen Akten. Keine Halluzinationen, keine Blackbox — oder Subsumio sagt ehrlich: ‚Keine Antwort.'",
      },
      {
        icon: ShieldCheck,
        title: "Bleibt, wo du willst",
        desc: "On-Premise auf deiner Hardware oder EU-Cloud mit AVV. Deine Daten, deine Schlüssel, deine Kontrolle.",
      },
    ],
    cta: "Features ansehen",
  },
} as const;

export default function SuperbrainAdvantage({ lang }: { lang: Lang }) {
  const t = copy[lang === "en" ? "en" : "de"];

  return (
    <section
      data-tone="slate"
      aria-label={UI_STRINGS[lang].ariaSubsumioEngine}
      className="relative z-10 overflow-hidden px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      {/* Premium top edge — hairline + subtle brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--mk-border-strong)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 0%, color-mix(in srgb, var(--brand-primary) 7%, transparent), transparent)",
        }}
      />
      <div className="brand-glow-bg absolute inset-x-0 top-16 h-72 opacity-25 blur-3xl" />

      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-12 text-center"
        >
          <p className="brand-text mb-4 font-mono text-xs tracking-wider uppercase">{t.eyebrow}</p>
          <h2 className={`${H2_CTA_CLASS} mb-5`}>{t.title}</h2>
          <p className="text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
            {t.sub}
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {t.pillars.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex flex-col items-start rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface-2)]"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border [border-color:var(--mk-border-strong)] [background:var(--mk-surface)]">
                  <Icon size={22} className="brand-text" />
                </div>
                <h3 className="mb-3 text-lg font-semibold [color:var(--mk-text)]">
                  {pillar.title}
                </h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {pillar.desc}
                </p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-10 text-center"
        >
          <Link href={p(lang, "/features")} className="inline-flex">
            <Button variant="outline" size="sm">
              {t.cta} <ArrowRight size={15} />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
