"use client";

// Dedicated pricing page — agency-grade tiers + value props + FAQ.
// MotionConfig wraps the whole page; ScrollProgress shows reading position;
// every section scroll-reveals; value-props use signal-colored tiles.

import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PRICING, PRICING_FAQ, p, type Lang } from "@/content/site";
import { SectionHeading } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { PricingGrid } from "./pricing-grid";
import { Reveal, StaggerContainer, StaggerItem } from "./motion-system";

const VALUE_PROPS = {
  de: [
    {
      title: "Keine versteckten Kosten",
      desc: "Was auf der Preisliste steht, zahlst du. Keine Überraschungen bei der Rechnung.",
    },
    {
      title: "Self-hosted oder Cloud",
      desc: "Du entscheidest, wo deine Daten liegen. EU-Cloud oder auf eigener Hardware.",
    },
    {
      title: "Open-Source Engine",
      desc: "Die Engine ist Open Source. Kein Vendor Lock-in, volle Kontrolle.",
    },
    {
      title: "Kostenlos starten",
      desc: "Der Community-Plan ist kostenlos. Upgrade jederzeit, downgrade auch.",
    },
  ],
  en: [
    { title: "No hidden costs", desc: "What you see is what you pay. No surprises on the bill." },
    {
      title: "Self-hosted or cloud",
      desc: "You decide where your data lives. EU cloud or your own hardware.",
    },
    {
      title: "Open-source engine",
      desc: "The engine is open source. No vendor lock-in, full control.",
    },
    { title: "Start free", desc: "The Community plan is free. Upgrade anytime, downgrade too." },
  ],
} as const;

export default function PricingPage({ lang }: { lang: Lang }) {
  const pricing = PRICING[lang];
  const faq = PRICING_FAQ[lang].items;
  const faqTitle = PRICING_FAQ[lang].title;
  const valueProps = VALUE_PROPS[lang];

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero */}
      <section className="relative z-10 px-6 pt-20 pb-16">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="brand-border brand-soft brand-text mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
              <Sparkles size={12} className="brand-text" />
              {lang === "de" ? "Transparent & fair" : "Transparent & fair"}
            </span>
            <h1 className="mb-5 text-4xl leading-[1.08] font-black tracking-tight [color:var(--mk-text)] md:text-6xl">
              {pricing.title}
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)] md:text-xl">
              {pricing.sub}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="relative z-10 px-6 pb-24">
        <div className="mx-auto max-w-6xl">
          <Reveal variant="up">
            <PricingGrid lang={lang} />
          </Reveal>
        </div>
      </section>

      {/* Value props — signal-colored tiles */}
      <section className="relative z-10 border-y [border-color:var(--mk-border)] px-6 py-24 [background:var(--mk-surface)]">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading
              title={lang === "de" ? "Warum unsere Preise fair sind" : "Why our pricing is fair"}
              sub={
                lang === "de"
                  ? "Kein Kleingedrucktes, keine versteckten Kosten."
                  : "No fine print, no hidden costs."
              }
            />
          </Reveal>
          <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.08}>
            {valueProps.map((prop) => (
              <StaggerItem
                key={prop.title}
                className="rounded-2xl border [border-color:var(--mk-border)] p-6 transition-colors [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                  <Check size={18} className="[color:var(--signal-green)]" />
                </div>
                <h3 className="mb-2 text-base font-bold [color:var(--mk-text)]">{prop.title}</h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{prop.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={faqTitle} />
          </Reveal>
          <AnimatedFaqList items={faq} tone="light" />
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t [border-color:var(--mk-border)] px-6 py-24 [background:var(--mk-surface)]">
        <Reveal variant="upLg" className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {lang === "de" ? "Noch Fragen?" : "Still have questions?"}
          </h2>
          <p className="mb-10 text-lg [color:var(--mk-text-muted)]">
            {lang === "de"
              ? "Schreib uns — wir antworten persönlich."
              : "Write to us — we reply personally."}
          </p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="glow">
              {lang === "de" ? "Kostenlos starten" : "Start free"} <ArrowRight size={18} />
            </Button>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
