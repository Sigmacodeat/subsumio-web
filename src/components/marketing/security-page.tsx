"use client";

// /security — agency-grade trust & data-protection page.
// MotionConfig wraps the page; ScrollProgress shows reading position;
// every section scroll-reveals with reduced-motion safety.

import Link from "next/link";
import { ArrowRight, Check, Shield, Layers, Lock, Eye, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import { SECURITY } from "@/content/security";
import { SectionHeading } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { Reveal, StaggerContainer, StaggerItem, GlowCard, ClipReveal } from "./motion-system";

const PILLAR_ICONS: Record<string, LucideIcon> = { Shield, Layers, Lock, Eye };

export default function SecurityPage({ lang }: { lang: Lang }) {
  const t = SECURITY[lang];

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero */}
      <section className="relative z-10 px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <Reveal variant="up" className="mx-auto max-w-4xl text-center">
          <span className="brand-text mb-6 inline-block rounded-full border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-3 py-1.5 text-xs font-medium">
            {t.badge}
          </span>
          <ClipReveal delay={0.1} duration={0.7} direction="up">
            <h1 className="mb-6 text-[clamp(2.5rem,10vw,3.75rem)] leading-[1.07] font-black tracking-tight text-balance [color:var(--mk-text)] md:text-5xl">
              {t.h1a}
              <span className="sr-only"> </span>
              <br />
              <span className="brand-text">{t.h1b}</span>
            </h1>
          </ClipReveal>
          <p className="mx-auto max-w-3xl text-lg leading-relaxed [color:var(--mk-text-muted)]">
            {t.sub}
          </p>
        </Reveal>
      </section>

      {/* Pillars */}
      <section className="relative z-10 px-4 py-16 sm:px-6 lg:px-8">
        <StaggerContainer className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2" stagger={0.1}>
          {t.pillars.map((pillar) => {
            const Icon = PILLAR_ICONS[pillar.icon] ?? Shield;
            return (
              <StaggerItem
                key={pillar.title}
                className="rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <Icon size={22} className="brand-text mb-4" />
                  <h2 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                    {pillar.title}
                  </h2>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {pillar.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </section>

      {/* Hosting options */}
      <section className="relative z-10 border-y [border-color:var(--mk-border)] px-4 py-16 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={t.hostingTitle} sub={t.hostingSub} />
          </Reveal>
          <StaggerContainer className="mt-8 grid gap-6 md:grid-cols-2" stagger={0.12}>
            {t.hostingOptions.map((opt) => (
              <StaggerItem
                key={opt.title}
                className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
              >
                <h3 className="mb-4 text-base font-semibold [color:var(--mk-text)]">{opt.title}</h3>
                <ul className="space-y-2.5">
                  {opt.points.map((point, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-sm leading-relaxed [color:var(--mk-text-muted)]"
                    >
                      <Check size={14} className="brand-text mt-1 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* Compliance today */}
      <section className="relative z-10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Reveal variant="up">
            <SectionHeading title={t.complianceTitle} />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <AnimatedFaqList
              items={t.complianceItems.map((item) => ({ q: item.title, a: item.desc }))}
              tone="light"
            />
          </Reveal>
        </div>
      </section>

      {/* EU AI Act */}
      <section className="relative z-10 px-4 py-12 sm:px-6 lg:px-8">
        <Reveal
          variant="up"
          className="mx-auto max-w-4xl rounded-2xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.04] p-7"
        >
          <h2 className="brand-text mb-2 text-lg font-bold">{t.aiActTitle}</h2>
          <p className="mb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">{t.aiActText}</p>
          <StaggerContainer className="space-y-4" stagger={0.08}>
            {t.aiActItems.map((item) => (
              <StaggerItem key={item.title} className="flex gap-2.5">
                <Check size={14} className="brand-text mt-1 shrink-0" />
                <div>
                  <h3 className="mb-1 text-sm font-bold [color:var(--mk-text)]">{item.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {item.desc}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </Reveal>
      </section>

      {/* Honest roadmap */}
      <section className="relative z-10 px-4 py-12 sm:px-6 lg:px-8">
        <Reveal
          variant="up"
          className="mx-auto max-w-4xl rounded-2xl border [border-color:var(--signal-amber-border)] p-7 [background:var(--signal-amber-bg)]"
        >
          <h2 className="mb-2 text-lg font-bold [color:var(--signal-amber)]">{t.roadmapTitle}</h2>
          <p className="mb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">
            {t.roadmapText}
          </p>
          <StaggerContainer className="space-y-2.5" stagger={0.06}>
            {t.roadmapItems.map((item, i) => (
              <StaggerItem key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <ArrowRight size={14} className="mt-1 shrink-0 [color:var(--signal-amber)]" />
                <span className="[color:var(--mk-text-muted)]">{item}</span>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="relative z-10 border-y [border-color:var(--mk-border)] px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={t.faqTitle} />
          </Reveal>
          <Reveal variant="up" delay={0.1}>
            <AnimatedFaqList items={t.faq} tone="light" />
          </Reveal>
        </div>
      </section>

      {/* Responsible disclosure */}
      <section className="relative z-10 px-4 py-16 sm:px-6 lg:px-8">
        <Reveal
          variant="up"
          className="mx-auto max-w-4xl rounded-2xl border [border-color:var(--mk-border)] p-7 [background:var(--mk-surface)]"
        >
          <h2 className="mb-2 text-sm font-bold [color:var(--mk-text)]">{t.disclosureTitle}</h2>
          <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{t.disclosureText}</p>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-4 py-28 sm:px-6 lg:px-8">
        <Reveal variant="upLg" className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-[clamp(1.75rem,7.5vw,2.25rem)] leading-tight font-black text-balance [color:var(--mk-text)] md:text-4xl">
            {t.ctaTitle}
          </h2>
          <p className="mb-8 text-lg [color:var(--mk-text-muted)]">{t.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="primary">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
