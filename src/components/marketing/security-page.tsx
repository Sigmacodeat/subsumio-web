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
import { Reveal, StaggerContainer, StaggerItem } from "./motion-system";

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
      <section className="relative z-10 px-6 pt-20 pb-16">
        <Reveal variant="up" className="mx-auto max-w-4xl text-center">
          <span className="brand-text mb-6 inline-block rounded-full border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-3 py-1 text-xs font-medium">
            {t.badge}
          </span>
          <h1 className="mb-6 text-4xl leading-tight font-bold [color:var(--mk-text)] md:text-5xl">
            {t.h1a}
            <br />
            <span className="brand-text">{t.h1b}</span>
          </h1>
          <p className="mx-auto max-w-3xl text-lg leading-relaxed [color:var(--mk-text-muted)]">
            {t.sub}
          </p>
        </Reveal>
      </section>

      {/* Pillars */}
      <section className="relative z-10 px-6 py-16">
        <StaggerContainer className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2" stagger={0.1}>
          {t.pillars.map((pillar) => {
            const Icon = PILLAR_ICONS[pillar.icon] ?? Shield;
            return (
              <StaggerItem
                key={pillar.title}
                className="rounded-2xl border [border-color:var(--mk-border)] p-7 [background:var(--mk-surface)]"
              >
                <Icon size={22} className="brand-text mb-4" />
                <h3 className="mb-2 text-base font-bold [color:var(--mk-text)]">{pillar.title}</h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {pillar.desc}
                </p>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </section>

      {/* Hosting options */}
      <section className="relative z-10 border-y [border-color:var(--mk-border)] px-6 py-16 [background:var(--mk-surface)]">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={t.hostingTitle} sub={t.hostingSub} />
          </Reveal>
          <StaggerContainer className="mt-8 grid gap-6 md:grid-cols-2" stagger={0.12}>
            {t.hostingOptions.map((opt) => (
              <StaggerItem
                key={opt.title}
                className="rounded-2xl border [border-color:var(--mk-border)] p-7 [background:var(--mk-surface)]"
              >
                <h3 className="mb-4 text-base font-bold [color:var(--mk-text)]">{opt.title}</h3>
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
      <section className="relative z-10 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <Reveal variant="up">
            <SectionHeading title={t.complianceTitle} />
          </Reveal>
          <StaggerContainer className="mt-8 space-y-4" stagger={0.08}>
            {t.complianceItems.map((item) => (
              <StaggerItem
                key={item.title}
                className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
              >
                <h3 className="mb-1.5 text-sm font-bold [color:var(--mk-text)]">{item.title}</h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{item.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* EU AI Act */}
      <section className="relative z-10 px-6 py-12">
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
      <section className="relative z-10 px-6 py-12">
        <Reveal
          variant="up"
          className="mx-auto max-w-4xl rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-7"
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
      <section className="relative z-10 border-y [border-color:var(--mk-border)] px-6 py-20 [background:var(--mk-surface)]">
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
      <section className="relative z-10 px-6 py-16">
        <Reveal
          variant="up"
          className="mx-auto max-w-4xl rounded-2xl border [border-color:var(--mk-border)] p-7 [background:var(--mk-surface)]"
        >
          <h3 className="mb-2 text-sm font-bold [color:var(--mk-text)]">{t.disclosureTitle}</h3>
          <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{t.disclosureText}</p>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-24">
        <Reveal variant="upLg" className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {t.ctaTitle}
          </h2>
          <p className="mb-8 text-lg [color:var(--mk-text-muted)]">{t.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="glow">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
