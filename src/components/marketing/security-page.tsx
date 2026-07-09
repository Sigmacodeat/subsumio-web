"use client";

// /security — agency-grade trust & data-protection page.
// MotionConfig wraps the page; ScrollProgress shows reading position;
// every section scroll-reveals with reduced-motion safety.

import { Check, Shield, Layers, Lock, Eye, ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import { Button } from "@/components/ui/button";
import { SECURITY } from "@/content/security";
import { SectionHeading, CTASection, PageHero, Section, ICONS } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { Reveal, StaggerContainer, StaggerItem, GlowCard } from "./motion-system";

const PILLAR_ICONS: Record<string, LucideIcon> = { Shield, Layers, Lock, Eye };

export default function SecurityPage({ lang }: { lang: Lang }) {
  const t = SECURITY[lang];

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
        icon={Shield}
        actions={
          <>
            <Link href={p(lang, "/signup")}>
              <Button size="lg" variant="primary">
                {UI_STRINGS[lang].startFree} <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href={p(lang, "/contact")}>
              <Button size="lg" variant="outline">
                {UI_STRINGS[lang].writeUs}
              </Button>
            </Link>
          </>
        }
      />

      {/* Pillars */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <StaggerContainer className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2" stagger={0.1}>
          {t.pillars.map((pillar) => {
            const Icon = PILLAR_ICONS[pillar.icon] ?? Shield;
            return (
              <StaggerItem
                key={pillar.title}
                className="rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <Icon size={22} className="brand-text mb-4" />
                  <h3 className="mb-2 text-xl font-semibold [color:var(--mk-text)]">
                    {pillar.title}
                  </h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {pillar.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </Section>

      {/* Hosting options */}
      <Section tone="light" className="px-4 py-16 [background:var(--mk-surface)] sm:px-6 lg:px-8">
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
                <h3 className="mb-4 text-lg font-semibold [color:var(--mk-text)]">{opt.title}</h3>
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
      </Section>

      {/* Compliance today */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
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
          <StaggerContainer className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.08}>
            {t.complianceBadges.map((b) => {
              const Icon = ICONS[b.icon] ?? Shield;
              return (
                <StaggerItem key={b.label}>
                  <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-5 text-center transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)]">
                    <div className="brand-soft brand-border mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                      <Icon size={22} className="brand-text" />
                    </div>
                    <h3 className="mb-1 text-sm font-semibold [color:var(--mk-text)]">{b.label}</h3>
                    <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">{b.sub}</p>
                  </GlowCard>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </Section>

      {/* EU AI Act */}
      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
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
      </Section>

      {/* Enterprise readiness */}
      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <Reveal
          variant="up"
          className="mx-auto max-w-4xl rounded-2xl border [border-color:var(--signal-green-border)] p-7 [background:var(--signal-green-bg)]"
        >
          <h2 className="mb-2 text-lg font-bold [color:var(--signal-green)]">
            {t.enterpriseTitle}
          </h2>
          <p className="mb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">
            {t.enterpriseText}
          </p>
          <StaggerContainer className="space-y-3" stagger={0.06}>
            {t.enterpriseItems.map((item, i) => (
              <StaggerItem key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <Check size={14} className="mt-1 shrink-0 [color:var(--signal-green)]" />
                <span>
                  <span className="font-semibold [color:var(--mk-text)]">{item.title}</span>
                  <span className="block [color:var(--mk-text-muted)]">{item.desc}</span>
                </span>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </Reveal>
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

      {/* Responsible disclosure */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <Reveal
          variant="up"
          className="mx-auto max-w-4xl rounded-2xl border [border-color:var(--mk-border)] p-7 [background:var(--mk-surface)]"
        >
          <h2 className="mb-2 text-sm font-bold [color:var(--mk-text)]">{t.disclosureTitle}</h2>
          <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{t.disclosureText}</p>
        </Reveal>
      </Section>

      {/* CTA */}
      <CTASection
        title={t.ctaTitle}
        sub={t.ctaSub}
        href={p(lang, "/signup")}
        label={t.ctaButton}
        secondaryHref={p(lang, "/contact")}
        secondaryLabel={UI_STRINGS[lang].writeUs}
        showLogo={false}
      />
    </div>
  );
}
