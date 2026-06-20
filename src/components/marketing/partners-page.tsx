"use client";

// Partner program page — agency-grade affiliate / referral / certified tracks.
// Full motion: MotionConfig, ScrollProgress, scroll-reveal on every section,
// GlowCards on tiers, StaggerContainer on grids, reduced-motion safe.

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Check, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/content/site";
import { PARTNERS } from "@/content/partners";
import {
  SectionHeading,
  FaqList,
  ICONS,
} from "./chrome";
import {
  Reveal,
  StaggerContainer,
  StaggerItem,
  GlowCard,
} from "./motion-system";

export default function PartnersPage({ lang }: { lang: Lang }) {
  const t = PARTNERS[lang];

  return (
    <div data-tone="light" className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>

        {/* Hero — animate on mount */}
        <section className="relative z-10 pt-20 pb-20 px-6 max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-xs [color:var(--signal-amber)] font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full [background:var(--signal-amber)] animate-pulse" />
              {t.badge}
            </span>
            <h1 className="text-4xl md:text-6xl font-black [color:var(--mk-text)] leading-[1.08] tracking-tight mb-6">
              {t.h1a}<br />
              <span className="gradient-text-gold glow-text">{t.h1b}</span>
            </h1>
            <p className="text-lg md:text-xl [color:var(--mk-text-muted)] max-w-2xl mx-auto mb-4 leading-relaxed">{t.sub}</p>
          </motion.div>
        </section>

        {/* Tiers — staggered reveal + GlowCard */}
        <section id="affiliate" className="relative z-10 pb-24 px-6 max-w-6xl mx-auto">
          <StaggerContainer className="grid md:grid-cols-3 gap-5" stagger={0.1}>
            {t.tiers.map((tier) => {
              const Icon = ICONS[tier.icon];
              return (
                <StaggerItem key={tier.id}>
                  <GlowCard
                    glowColor={tier.highlight ? "#f59e0b" : "var(--brand-primary)"}
                    intensity={tier.highlight ? 0.22 : 0.12}
                    className={`relative h-full p-7 rounded-2xl border flex flex-col transition-all duration-200 ${
                      tier.highlight
                        ? "border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-[var(--mk-surface)] shadow-xl shadow-amber-900/10"
                        : "[border-color:var(--mk-border)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
                    }`}
                  >
                    {tier.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="brand-bg text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                          {lang === "en" ? "Most popular" : "Beliebteste Wahl"}
                        </span>
                      </div>
                    )}
                    <div className={`w-11 h-11 rounded-lg border flex items-center justify-center mb-5 ${
                      tier.highlight
                        ? "[color:var(--signal-amber)] bg-amber-500/10 border-amber-500/20"
                        : "brand-text bg-[var(--brand-primary)]/10 border-[var(--brand-primary)]/20"
                    }`}>
                      {Icon && <Icon size={20} />}
                    </div>
                    <p className="text-sm font-medium [color:var(--mk-text-muted)] mb-1">{tier.name}</p>
                    <p className={`text-xl font-bold mb-3 ${tier.highlight ? "gradient-text-gold" : "[color:var(--mk-text)]"}`}>{tier.headline}</p>
                    <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed mb-6">{tier.desc}</p>
                    <ul className="space-y-2.5 flex-1 mb-7">
                      {tier.points.map((point) => (
                        <li key={point} className="flex items-start gap-2 text-xs [color:var(--mk-text-muted)]">
                          <Check size={13} className={`shrink-0 mt-0.5 ${tier.highlight ? "[color:var(--signal-amber)]" : "brand-text"}`} />
                          {point}
                        </li>
                      ))}
                    </ul>
                    {tier.href.startsWith("mailto") ? (
                      <a href={tier.href}>
                        <Button variant={tier.highlight ? "glow" : "secondary"} size="md" className="w-full">
                          {tier.cta} <ArrowRight size={13} />
                        </Button>
                      </a>
                    ) : (
                      <Link href={tier.href}>
                        <Button variant={tier.highlight ? "glow" : "secondary"} size="md" className="w-full">
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
        <section className="relative z-10 py-20 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <Reveal variant="up" className="max-w-3xl mx-auto text-center">
            <TrendingUp size={28} className="[color:var(--signal-amber)] mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-black [color:var(--mk-text)] mb-5">{t.calcTitle}</h2>
            <p className="text-lg [color:var(--mk-text)] leading-relaxed mb-6">{t.calcSub}</p>
            <p className="text-xs [color:var(--mk-text-subtle)] max-w-xl mx-auto leading-relaxed">{t.calcNote}</p>
          </Reveal>
        </section>

        {/* How it works */}
        <section className="relative z-10 py-24 px-6 max-w-5xl mx-auto">
          <Reveal variant="up">
            <SectionHeading title={t.howTitle} />
          </Reveal>
          <StaggerContainer className="grid md:grid-cols-3 gap-6" stagger={0.12}>
            {t.how.map((item) => (
              <StaggerItem key={item.step}>
                <div className="h-full p-6 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-lg transition-all">
                  <span className="text-xs font-mono [color:var(--mk-text-subtle)] block mb-4">{item.step}</span>
                  <h3 className="text-base font-semibold [color:var(--mk-text)] mb-2">{item.title}</h3>
                  <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{item.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>

        {/* FAQ */}
        <section className="relative z-10 py-20 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-5xl mx-auto">
            <Reveal variant="up">
              <SectionHeading title={t.faqTitle} />
            </Reveal>
            <Reveal variant="up" delay={0.1}>
              <FaqList items={t.faq} />
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 py-24 px-6 text-center max-w-3xl mx-auto">
          <Reveal variant="upLg">
            <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
            <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
            <a href="mailto:partners@subsum.eu?subject=Partner%20application">
              <Button size="xl" variant="glow">
                {t.ctaButton} <ArrowRight size={18} />
              </Button>
            </a>
          </Reveal>
        </section>

    </div>
  );
}
