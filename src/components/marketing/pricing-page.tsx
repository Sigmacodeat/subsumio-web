"use client";

// Dedicated pricing page — agency-grade tiers + value props + FAQ.
// MotionConfig wraps the whole page; ScrollProgress shows reading position;
// every section scroll-reveals; value-props use signal-colored tiles.

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PRICING, PRICING_FAQ, VALUE_PROPS, UI_STRINGS, p, type Lang } from "@/content/site";
import { SectionHeading } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { PricingGrid } from "./pricing-grid";
import { Reveal, StaggerContainer, StaggerItem, GlowCard, ClipReveal } from "./motion-system";

export default function PricingPage({ lang }: { lang: Lang }) {
  const pricing = PRICING[lang];
  const faq = PRICING_FAQ[lang].items;
  const faqTitle = PRICING_FAQ[lang].title;
  const valueProps = VALUE_PROPS[lang];
  const ui = UI_STRINGS[lang];

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
              <Check size={12} className="brand-text" />
              {ui.transparentFair}
            </span>
            <ClipReveal delay={0.1} duration={0.7} direction="up">
              <h1 className="mb-5 text-[clamp(2.5rem,10vw,3.75rem)] leading-[1.07] font-black tracking-tight [color:var(--mk-text)] md:text-6xl">
                {pricing.title}
              </h1>
            </ClipReveal>
            <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)] md:text-xl">
              {pricing.sub}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="relative z-10 px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal variant="up">
            <PricingGrid lang={lang} />
          </Reveal>
        </div>
      </section>

      {/* Value props — signal-colored tiles */}
      <section className="relative z-10 px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={ui.noGamesTitle} sub={ui.noGamesSub} />
          </Reveal>
          <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.08}>
            {valueProps.map((prop) => (
              <StaggerItem
                key={prop.title}
                className="rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-colors [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border [border-color:var(--signal-green-border)] transition-transform duration-300 [background:var(--signal-green-bg)] hover:scale-110">
                    <Check size={18} className="[color:var(--signal-green)]" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                    {prop.title}
                  </h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {prop.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={faqTitle} />
          </Reveal>
          <AnimatedFaqList items={faq} tone="light" />
        </div>
      </section>

      {/* CTA */}
      <section data-tone="dark" className="relative z-10 px-4 py-28 sm:px-6 lg:px-8">
        <Reveal variant="upLg" className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {ui.stillQuestions}
          </h2>
          <p className="mb-10 text-lg [color:var(--mk-text-muted)]">{ui.writeUs}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="primary">
              {ui.startFree} <ArrowRight size={18} />
            </Button>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
