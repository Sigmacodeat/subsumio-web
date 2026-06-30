"use client";

// Partner program page — agency-grade affiliate / referral / certified tracks.
// Full motion: MotionConfig, ScrollProgress, scroll-reveal on every section,
// GlowCards on tiers, StaggerContainer on grids, reduced-motion safe.

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Check, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/content/site";
import { UI_STRINGS } from "@/content/site";
import { PARTNERS } from "@/content/partners";
import { SectionHeading, ICONS } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { Reveal, StaggerContainer, StaggerItem, GlowCard, ClipReveal } from "./motion-system";

export default function PartnersPage({ lang }: { lang: Lang }) {
  const t = PARTNERS[lang];

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero — animate on mount */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-tertiary)]/30 bg-[color:var(--brand-tertiary)]/10 px-3 py-1.5 text-xs font-medium text-[color:var(--brand-tertiary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-tertiary)]" />
            {t.badge}
          </span>
          <ClipReveal delay={0.1} duration={0.7} direction="up">
            <h1 className="mb-6 text-[clamp(2.5rem,7vw,4rem)] leading-[1.08] font-black tracking-tight text-balance [color:var(--mk-text)]">
              {t.h1a}
              <span className="sr-only"> </span>
              <br />
              <span className="gradient-text-premium glow-text">{t.h1b}</span>
            </h1>
          </ClipReveal>
          <p className="mx-auto mb-4 max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg">
            {t.sub}
          </p>
        </motion.div>
      </section>

      {/* Tiers — staggered reveal + GlowCard */}
      <section id="affiliate" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <StaggerContainer className="grid gap-5 md:grid-cols-3" stagger={0.1}>
          {t.tiers.map((tier) => {
            const Icon = ICONS[tier.icon];
            return (
              <StaggerItem key={tier.id}>
                <GlowCard
                  glowColor={tier.highlight ? "var(--brand-tertiary)" : "var(--brand-primary)"}
                  intensity={tier.highlight ? 0.22 : 0.12}
                  className={`relative flex h-full flex-col rounded-2xl border p-6 transition-all duration-200 ${
                    tier.highlight
                      ? "border-[color:var(--brand-tertiary)]/40 bg-gradient-to-b from-[color:var(--brand-tertiary)]/10 to-[var(--mk-surface)] shadow-xl shadow-[color:var(--brand-tertiary)]/10"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
                  }`}
                >
                  {tier.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="brand-bg rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white">
                        {UI_STRINGS[lang].mostPopular}
                      </span>
                    </div>
                  )}
                  <div
                    className={`mb-5 flex h-11 w-11 items-center justify-center rounded-lg border ${
                      tier.highlight
                        ? "border-[color:var(--brand-tertiary)]/20 bg-[color:var(--brand-tertiary)]/10 text-[color:var(--brand-tertiary)]"
                        : "brand-text border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/10"
                    }`}
                  >
                    {Icon && <Icon size={20} />}
                  </div>
                  <p className="mb-1 text-sm font-medium [color:var(--mk-text-muted)]">
                    {tier.name}
                  </p>
                  <p
                    className={`mb-3 text-xl font-bold ${tier.highlight ? "gradient-text-premium" : "[color:var(--mk-text)]"}`}
                  >
                    {tier.headline}
                  </p>
                  <p className="mb-6 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {tier.desc}
                  </p>
                  <ul className="mb-7 flex-1 space-y-2.5">
                    {tier.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-xs [color:var(--mk-text-muted)]"
                      >
                        <Check
                          size={13}
                          className={`mt-0.5 shrink-0 ${tier.highlight ? "text-[color:var(--brand-tertiary)]" : "brand-text"}`}
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                  {tier.href.startsWith("mailto") ? (
                    <a href={tier.href}>
                      <Button
                        variant={tier.highlight ? "primary" : "secondary"}
                        size="md"
                        className="w-full"
                      >
                        {tier.cta} <ArrowRight size={13} />
                      </Button>
                    </a>
                  ) : (
                    <Link href={tier.href}>
                      <Button
                        variant={tier.highlight ? "primary" : "secondary"}
                        size="md"
                        className="w-full"
                      >
                        {tier.cta} <ArrowRight size={13} />
                      </Button>
                    </Link>
                  )}
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </section>

      {/* Earnings illustration */}
      <section className="relative z-10 px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <Reveal variant="up" className="mx-auto max-w-3xl text-center">
          <TrendingUp size={28} className="mx-auto mb-6 [color:var(--signal-amber)]" />
          <h2 className="mb-5 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
            {t.calcTitle}
          </h2>
          <p className="mb-6 text-lg leading-relaxed [color:var(--mk-text)]">{t.calcSub}</p>
          <p className="mx-auto max-w-xl text-xs leading-relaxed [color:var(--mk-text-subtle)]">
            {t.calcNote}
          </p>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
        <Reveal variant="up">
          <SectionHeading title={t.howTitle} />
        </Reveal>
        <StaggerContainer className="grid gap-6 md:grid-cols-3" stagger={0.12}>
          {t.how.map((item) => (
            <StaggerItem key={item.step}>
              <GlowCard className="h-full rounded-xl border [border-color:var(--mk-border)] p-6 transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-lg">
                <span className="mb-4 block font-mono text-xs [color:var(--mk-text-subtle)]">
                  {item.step}
                </span>
                <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{item.desc}</p>
              </GlowCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* FAQ */}
      <section className="relative z-10 px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={t.faqTitle} />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <AnimatedFaqList items={t.faq} tone="light" />
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section
        data-tone="dark"
        className="relative z-10 mx-auto max-w-3xl px-4 py-28 text-center sm:px-6 lg:px-8"
      >
        <Reveal variant="upLg">
          <h2 className="mb-4 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
            {t.ctaTitle}
          </h2>
          <p className="mb-10 text-base [color:var(--mk-text-muted)] md:text-lg">{t.ctaSub}</p>
          <a href="mailto:partners@subsum.eu?subject=Partner%20application">
            <Button size="xl" variant="primary">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </a>
        </Reveal>
      </section>
    </div>
  );
}
