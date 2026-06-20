"use client";

// /security — agency-grade trust & data-protection page.
// MotionConfig wraps the page; ScrollProgress shows reading position;
// every section scroll-reveals with reduced-motion safety.

import Link from "next/link";
import { ArrowRight, Check, Shield, Layers, Lock, Eye, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import { SECURITY } from "@/content/security";
import {
  SectionHeading,
  FaqList,
} from "./chrome";
import { Reveal, StaggerContainer, StaggerItem } from "./motion-system";

const PILLAR_ICONS: Record<string, LucideIcon> = { Shield, Layers, Lock, Eye };

export default function SecurityPage({ lang }: { lang: Lang }) {
  const t = SECURITY[lang];

  return (
    <div data-tone="light" className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>

      {/* Hero */}
      <section className="relative z-10 pt-20 pb-16 px-6">
        <Reveal variant="up" className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 brand-text text-xs font-medium mb-6">
            {t.badge}
          </span>
          <h1 className="text-4xl md:text-5xl font-bold [color:var(--mk-text)] leading-tight mb-6">
            {t.h1a}
            <br />
            <span className="brand-text">{t.h1b}</span>
          </h1>
          <p className="text-lg [color:var(--mk-text-muted)] leading-relaxed max-w-3xl mx-auto">{t.sub}</p>
        </Reveal>
      </section>

      {/* Pillars */}
      <section className="relative z-10 py-16 px-6">
        <StaggerContainer className="max-w-6xl mx-auto grid md:grid-cols-2 gap-5" stagger={0.1}>
          {t.pillars.map((pillar) => {
            const Icon = PILLAR_ICONS[pillar.icon] ?? Shield;
            return (
              <StaggerItem key={pillar.title} className="p-7 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
                <Icon size={22} className="brand-text mb-4" />
                <h3 className="text-base font-bold [color:var(--mk-text)] mb-2">{pillar.title}</h3>
                <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{pillar.desc}</p>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </section>

      {/* Hosting options */}
      <section className="relative z-10 py-16 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
        <div className="max-w-5xl mx-auto">
          <Reveal variant="up">
            <SectionHeading title={t.hostingTitle} sub={t.hostingSub} />
          </Reveal>
          <StaggerContainer className="grid md:grid-cols-2 gap-6 mt-8" stagger={0.12}>
            {t.hostingOptions.map((opt) => (
              <StaggerItem key={opt.title} className="p-7 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
                <h3 className="text-base font-bold [color:var(--mk-text)] mb-4">{opt.title}</h3>
                <ul className="space-y-2.5">
                  {opt.points.map((point, i) => (
                    <li key={i} className="flex gap-2.5 text-sm [color:var(--mk-text-muted)] leading-relaxed">
                      <Check size={14} className="brand-text shrink-0 mt-1" />
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
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal variant="up">
            <SectionHeading title={t.complianceTitle} />
          </Reveal>
          <StaggerContainer className="space-y-4 mt-8" stagger={0.08}>
            {t.complianceItems.map((item) => (
              <StaggerItem key={item.title} className="p-6 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
                <h3 className="text-sm font-bold [color:var(--mk-text)] mb-1.5">{item.title}</h3>
                <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{item.desc}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* EU AI Act */}
      <section className="relative z-10 py-12 px-6">
        <Reveal variant="up" className="max-w-4xl mx-auto p-7 rounded-2xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.04]">
          <h2 className="text-lg font-bold brand-text mb-2">{t.aiActTitle}</h2>
          <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed mb-4">{t.aiActText}</p>
          <StaggerContainer className="space-y-4" stagger={0.08}>
            {t.aiActItems.map((item) => (
              <StaggerItem key={item.title} className="flex gap-2.5">
                <Check size={14} className="brand-text shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm font-bold [color:var(--mk-text)] mb-1">{item.title}</h3>
                  <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{item.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </Reveal>
      </section>

      {/* Honest roadmap */}
      <section className="relative z-10 py-12 px-6">
        <Reveal variant="up" className="max-w-4xl mx-auto p-7 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04]">
          <h2 className="text-lg font-bold [color:var(--signal-amber)] mb-2">{t.roadmapTitle}</h2>
          <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed mb-4">{t.roadmapText}</p>
          <StaggerContainer className="space-y-2.5" stagger={0.06}>
            {t.roadmapItems.map((item, i) => (
              <StaggerItem key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <ArrowRight size={14} className="[color:var(--signal-amber)] shrink-0 mt-1" />
                <span className="[color:var(--mk-text-muted)]">{item}</span>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </Reveal>
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

      {/* Responsible disclosure */}
      <section className="relative z-10 py-16 px-6">
        <Reveal variant="up" className="max-w-4xl mx-auto p-7 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
          <h3 className="text-sm font-bold [color:var(--mk-text)] mb-2">{t.disclosureTitle}</h3>
          <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{t.disclosureText}</p>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-24 px-6">
        <Reveal variant="upLg" className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
          <p className="text-lg [color:var(--mk-text-muted)] mb-8">{t.ctaSub}</p>
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
