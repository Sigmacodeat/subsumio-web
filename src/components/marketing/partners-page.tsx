"use client";

// Partner program page — agency-grade affiliate / referral / certified tracks.
// Full motion: MotionConfig, ScrollProgress, scroll-reveal on every section,
// GlowCards on tiers, StaggerContainer on grids, reduced-motion safe.

import Link from "next/link";
import { ArrowRight, Check, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/content/site";
import { UI_STRINGS } from "@/content/site";
import { PARTNERS } from "@/content/partners";
import { SectionHeading, ICONS, CTASection, PageHero, Section } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { Reveal, StaggerContainer, StaggerItem, GlowCard } from "./motion-system";

export default function PartnersPage({ lang }: { lang: Lang }) {
  const t = PARTNERS[lang];

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero */}
      <PageHero
        badge={t.badge}
        h1a={t.h1a}
        h1b={t.h1b}
        sub={t.sub}
        accentVariant="gradient-premium"
      />

      {/* Tiers — staggered reveal + GlowCard */}
      <Section id="affiliate" tone="light" className="mx-auto max-w-6xl px-6 pb-24">
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
                  <ul className="mb-6 flex-1 space-y-2.5">
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
      </Section>

      {/* Earnings illustration */}
      <Section tone="light" className="px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <Reveal variant="up" className="mx-auto max-w-3xl text-center">
          <TrendingUp size={28} className="brand-text mx-auto mb-6" />
          <SectionHeading title={t.calcTitle} />
          <p className="mb-6 text-lg leading-relaxed text-pretty [color:var(--mk-text)]">
            {t.calcSub}
          </p>
          <p className="mx-auto max-w-xl text-xs leading-relaxed [color:var(--mk-text-subtle)]">
            {t.calcNote}
          </p>
        </Reveal>
      </Section>

      {/* How it works */}
      <Section tone="light" className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
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
      </Section>

      {/* FAQ */}
      <Section tone="light" className="px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={t.faqTitle} />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <AnimatedFaqList items={t.faq} tone="light" />
          </Reveal>
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title={t.ctaTitle}
        sub={t.ctaSub}
        href="mailto:partners@subsum.eu?subject=Partner%20application"
        label={t.ctaButton}
        showLogo={false}
      />
    </div>
  );
}
