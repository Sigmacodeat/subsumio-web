"use client";

// Dedicated pricing page — agency-grade tiers + value props + FAQ.
// MotionConfig wraps the whole page; ScrollProgress shows reading position;
// every section scroll-reveals; value-props use signal-colored tiles.

import { motion, MotionConfig } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PRICING, PRICING_FAQ, p, type Lang } from "@/content/site";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  SectionHeading,
  FaqList,
} from "./chrome";
import { PricingGrid } from "./pricing-grid";
import {
  Reveal,
  ScrollProgress,
  StaggerContainer,
  StaggerItem,
} from "./motion-system";
import BackToTop from "./back-to-top";

const VALUE_PROPS = {
  de: [
    { title: "Keine versteckten Kosten", desc: "Was auf der Preisliste steht, zahlst du. Keine Überraschungen bei der Rechnung." },
    { title: "Self-hosted oder Cloud", desc: "Du entscheidest, wo deine Daten liegen. EU-Cloud oder auf eigener Hardware." },
    { title: "Open-Source Engine", desc: "Die Engine ist Open Source. Kein Vendor Lock-in, volle Kontrolle." },
    { title: "Kostenlos starten", desc: "Der Community-Plan ist kostenlos. Upgrade jederzeit, downgrade auch." },
  ],
  en: [
    { title: "No hidden costs", desc: "What you see is what you pay. No surprises on the bill." },
    { title: "Self-hosted or cloud", desc: "You decide where your data lives. EU cloud or your own hardware." },
    { title: "Open-source engine", desc: "The engine is open source. No vendor lock-in, full control." },
    { title: "Start free", desc: "The Community plan is free. Upgrade anytime, downgrade too." },
  ],
} as const;

export default function PricingPage({ lang }: { lang: Lang }) {
  const pricing = PRICING[lang];
  const faq = PRICING_FAQ[lang].items;
  const faqTitle = PRICING_FAQ[lang].title;
  const valueProps = VALUE_PROPS[lang];

  return (
    <MotionConfig reducedMotion="user">
      <div data-tone="light" className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>
        <ScrollProgress />
        <MarketingBackground />
        <MarketingNav lang={lang} />

        {/* Hero */}
        <section className="relative z-10 pt-20 pb-16 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border brand-border brand-soft text-xs brand-text font-medium mb-6">
                <Sparkles size={12} className="brand-text" />
                {lang === "de" ? "Transparent & fair" : "Transparent & fair"}
              </span>
              <h1 className="text-4xl md:text-6xl font-black [color:var(--mk-text)] leading-[1.08] tracking-tight mb-5">
                {pricing.title}
              </h1>
              <p className="text-lg md:text-xl [color:var(--mk-text-muted)] max-w-2xl mx-auto leading-relaxed mb-8">
                {pricing.sub}
              </p>
            </motion.div>
          </div>
        </section>

        {/* Pricing Grid */}
        <section className="relative z-10 pb-24 px-6">
          <div className="max-w-6xl mx-auto">
            <Reveal variant="up">
              <PricingGrid lang={lang} />
            </Reveal>
          </div>
        </section>

        {/* Value props — signal-colored tiles */}
        <section className="relative z-10 py-24 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-5xl mx-auto">
            <Reveal variant="up">
              <SectionHeading
                title={lang === "de" ? "Warum unsere Preise fair sind" : "Why our pricing is fair"}
                sub={lang === "de" ? "Kein Kleingedrucktes, keine versteckten Kosten." : "No fine print, no hidden costs."}
              />
            </Reveal>
            <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5" stagger={0.08}>
              {valueProps.map((prop) => (
                <StaggerItem
                  key={prop.title}
                  className="p-6 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)] transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                    <Check size={18} className="[color:var(--signal-green)]" />
                  </div>
                  <h3 className="text-base font-bold [color:var(--mk-text)] mb-2">{prop.title}</h3>
                  <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{prop.desc}</p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative z-10 py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <Reveal variant="up">
              <SectionHeading title={faqTitle} />
            </Reveal>
            <FaqList items={faq} />
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 py-24 px-6 [background:var(--mk-surface)] border-t [border-color:var(--mk-border)]">
          <Reveal variant="upLg" className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">
              {lang === "de" ? "Noch Fragen?" : "Still have questions?"}
            </h2>
            <p className="text-lg [color:var(--mk-text-muted)] mb-10">
              {lang === "de" ? "Schreib uns — wir antworten persönlich." : "Write to us — we reply personally."}
            </p>
            <Link href={p(lang, "/signup")}>
              <Button size="xl" variant="glow">
                {lang === "de" ? "Kostenlos starten" : "Start free"} <ArrowRight size={18} />
              </Button>
            </Link>
          </Reveal>
        </section>

        <MarketingFooter lang={lang} />
        <BackToTop lang={lang} />
      </div>
    </MotionConfig>
  );
}
