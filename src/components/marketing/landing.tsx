"use client";

// Sigmabrain landing page — renders EN or DE from src/content/site.ts.
// Agency-grade motion: load-in hero, scroll-reveal sections, staggered cards,
// interactive live demo, parallax background (via MarketingBackground). All
// decorative motion respects prefers-reduced-motion via MotionConfig.

import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaMark } from "@/components/brand/logo";
import { LANDING, PRICING, p, type Lang } from "@/content/site";
import { SUBSUMIO_SITE_URL, TAXUMIO_SITE_URL, isExternalUrl } from "@/lib/brand";
import { PricingGrid } from "./pricing-grid";
import LiveDemo from "./live-demo";
import DashboardReel from "./dashboard-reel";
import ProductWorkflowShowcase from "./product-workflow-showcase";
import SuperbrainAdvantage from "./superbrain-advantage";
import TrustBand from "./trust-band";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  SectionHeading,
  FaqList,
  ICONS,
} from "./chrome";
import { GlowCard, ClipReveal, StaggerContainer, StaggerItem, ScrollProgress } from "./motion-system";

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;

// Signal-color icon tiles tuned for LIGHT card surfaces (darker shades for
// contrast on white) — used by the light Features band in the light/dark mix.
const LIGHT_COLOR_MAP: Record<string, string> = {
  violet: "text-violet-700 bg-violet-50 border-violet-200",
  blue: "text-blue-700 bg-blue-50 border-blue-200",
  emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  amber: "text-amber-700 bg-amber-50 border-amber-200",
  rose: "text-rose-700 bg-rose-50 border-rose-200",
  purple: "text-purple-700 bg-purple-50 border-purple-200",
};
// Section/card scroll-reveal preset.
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: "easeOut" as const },
};

export default function LandingPage({ lang }: { lang: Lang }) {
  const t = LANDING[lang];
  const pricing = PRICING[lang];

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>
        <ScrollProgress />
        <MarketingBackground />
        {/* Light hero band — nav + hero on a cool premium gray surface */}
        <div data-tone="light" className="relative" style={{ background: "var(--mk-bg)" }}>
        <MarketingNav lang={lang} theme="light" />

        {/* Hero */}
        <section className="relative z-10 pt-14 pb-28 px-6 max-w-7xl mx-auto text-center">
          <motion.div
            className="relative z-10"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-8" style={{ color: "var(--signal-blue)", background: "rgba(29,78,216,0.08)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--signal-blue)" }} />
              {t.badge}
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6 [color:var(--mk-text)]">
              {t.h1a}<br />
              <span className="[color:var(--brand-primary)]">{t.h1b}</span>
            </h1>
            <p className="text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed [color:var(--mk-text-muted)]">{t.sub}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
              <Link href={p(lang, "/signup")}>
                <Button size="xl" variant="glow" className="min-w-[200px]">
                  <SigmaMark size={18} tile={false} /> {t.ctaPrimary}
                </Button>
              </Link>
              <a href="#demo">
                <Button size="xl" variant="secondary" className="min-w-[200px]">
                  {t.ctaSecondary} <ChevronRight size={18} />
                </Button>
              </a>
            </div>
          </motion.div>

          <motion.div
            id="demo"
            className="relative z-10 max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
          >
            {/* Pin the demo mockup to dark so it keeps its terminal look
                even when the surrounding hero is light-toned. */}
            <div data-tone="dark">
              <LiveDemo lang={lang} {...t.demo} />
            </div>
          </motion.div>
        </section>
        </div>

        {/* Stats */}
        <motion.section {...reveal} className="relative z-10 py-28 px-6 border-y [border-color:var(--mk-border)] [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)]">
          <div className="max-w-4xl mx-auto">
            <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center mb-6" stagger={0.09}>
              {t.stats.map((stat) => (
                <StaggerItem key={stat.label}>
                  <p className="text-3xl font-black gradient-text-animated mb-1">{stat.value}</p>
                  <p className="text-sm [color:var(--mk-text-muted)]">{stat.label}</p>
                </StaggerItem>
              ))}
            </StaggerContainer>
            <p className="text-center text-xs [color:var(--mk-text-subtle)]">{t.statsNote}</p>
          </div>
        </motion.section>

        <SuperbrainAdvantage lang={lang} />

        <ProductWorkflowShowcase lang={lang} />

        {/* Dashboard in action */}
        <section className="relative z-10 py-28 px-6 max-w-5xl mx-auto">
          <motion.div {...reveal}>
            <SectionHeading
              badge={lang === "de" ? "In Aktion" : "In action"}
              title={lang === "de" ? "Datei anhängen. Fragen. Zitierte Antwort." : "Attach a file. Ask. Cited answer."}
              sub={lang === "de"
                ? "Dateien per Upload, Google Drive oder Anwaltssoftware ins Brain — dann im Chat fragen, mit seitengenauen Quellen."
                : "Bring files in via upload, Google Drive or your practice software — then ask in chat, with page-level sources."}
            />
          </motion.div>
          <motion.div {...reveal}>
            <DashboardReel lang={lang} />
          </motion.div>
        </section>

        {/* Features — light band (cool premium gray, never warm beige) */}
        <section id="features" data-tone="light" className="relative z-10 py-28 px-6" style={{ background: "var(--mk-bg)" }}>
          <div className="max-w-7xl mx-auto">
            <motion.div {...reveal}>
              <SectionHeading badge="Features" title={t.featuresTitle} sub={t.featuresSub} />
            </motion.div>
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" stagger={0.07} y={16}>
              {t.features.map((f) => {
                const Icon = ICONS[f.icon];
                return (
                  <StaggerItem key={f.title}>
                    <GlowCard
                      className="h-full p-6 rounded-2xl [background:var(--mk-surface)] border [border-color:var(--mk-border)] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:[border-color:var(--mk-border-strong)]"
                      style={{ boxShadow: "var(--mk-card-shadow)" } as React.CSSProperties}
                    >
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-4 ${LIGHT_COLOR_MAP[f.color] ?? LIGHT_COLOR_MAP.blue}`}>
                        {Icon && <Icon size={18} />}
                      </div>
                      <h3 className="text-base font-semibold mb-2 [color:var(--mk-text)]">{f.title}</h3>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{f.desc}</p>
                    </GlowCard>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </section>

        {/* How it works */}
        <section className="relative z-10 py-28 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-5xl mx-auto">
            <motion.div {...reveal}><SectionHeading title={t.howTitle} /></motion.div>
            <StaggerContainer className="grid md:grid-cols-3 gap-6" stagger={0.1} y={18}>
              {t.how.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <StaggerItem key={item.step}>
                    <GlowCard
                      className="h-full p-6 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] transition-all duration-300 hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)]"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-xs font-mono [color:var(--mk-text-subtle)]">{item.step}</span>
                        <div className="w-8 h-8 rounded-lg bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 flex items-center justify-center">
                          {Icon && <Icon size={15} className="text-[var(--brand-primary)]" />}
                        </div>
                      </div>
                      <h3 className="text-base font-semibold [color:var(--mk-text)] mb-2">{item.title}</h3>
                      <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{item.desc}</p>
                    </GlowCard>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </section>

        {/* Verticals */}
        <section className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
          <motion.div {...reveal}><SectionHeading title={t.verticalsTitle} sub={t.verticalsSub} /></motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {t.verticalCards.map((v, i) => {
              const comingSoon = "comingSoon" in v && v.comingSoon;
              const soonLabel = lang === "de" ? "Bald verfügbar" : "Coming soon";
              return (
                <motion.div
                  key={v.href}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={comingSoon ? undefined : { y: -4 }}
                  viewport={viewport}
                  transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
                  className="h-full"
                >
                  {comingSoon ? (
                    <div className="relative h-full p-7 rounded-2xl border [border-color:var(--mk-border)] [background:color-mix(in_srgb,var(--mk-surface)_60%,transparent)] flex flex-col cursor-default">
                      <span className="absolute top-5 right-5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 px-2 py-0.5 rounded-full">
                        {soonLabel}
                      </span>
                      <h3 className="text-lg font-bold [color:var(--mk-text-muted)] mb-2 pr-24">{v.title}</h3>
                      <p className="text-sm [color:var(--mk-text-subtle)] leading-relaxed flex-1 mb-5">{v.desc}</p>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium [color:var(--mk-text-subtle)]">
                        {soonLabel}
                      </span>
                    </div>
                  ) : (() => {
                    const resolvedHref = v.href === "/subsumio" ? SUBSUMIO_SITE_URL : v.href === "/taxumio" ? TAXUMIO_SITE_URL : v.href;
                    const cardCls = "group h-full p-7 rounded-2xl border border-[var(--brand-primary)]/30 [background:var(--mk-surface-2)] hover:border-[var(--brand-primary)]/60 hover:bg-[#16163a] transition-colors duration-200 flex flex-col shadow-lg shadow-[var(--brand-primary)]/5";
                    const cardInner = (
                      <>
                        <h3 className="text-lg font-bold [color:var(--mk-text)] mb-2 group-hover:text-[var(--brand-primary)]">{v.title}</h3>
                        <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed flex-1 mb-5">{v.desc}</p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-primary)]">
                          {v.cta} <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </>
                    );
                    return isExternalUrl(resolvedHref) ? (
                      <a href={resolvedHref} className={cardCls}>{cardInner}</a>
                    ) : (
                      <Link href={p(lang, resolvedHref)} className={cardCls}>{cardInner}</Link>
                    );
                  })()}
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Scenarios (honest — no fake testimonials) */}
        <section className="relative z-10 py-28 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-7xl mx-auto">
            <motion.div {...reveal}><SectionHeading title={t.scenariosTitle} sub={t.scenariosSub} /></motion.div>
            <div className="grid md:grid-cols-3 gap-6">
              {t.scenarios.map((s, i) => (
                <motion.div
                  key={s.role}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewport}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="p-6 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]"
                >
                  <p className="text-xs font-semibold text-[var(--brand-primary)] uppercase tracking-wider mb-3">{s.role}</p>
                  <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{s.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust band — light section (the serious counterpoint, primes pricing) */}
        <TrustBand lang={lang} />

        {/* Pricing */}
        <section id="pricing" className="relative z-10 py-28 px-6">
          <motion.div {...reveal} className="max-w-6xl mx-auto">
            <SectionHeading badge="Pricing" title={pricing.title} sub={pricing.sub} />
            <PricingGrid lang={lang} />
          </motion.div>
        </section>

        {/* FAQ */}
        <section className="relative z-10 py-28 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)]">
          <motion.div {...reveal} className="max-w-5xl mx-auto">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq} />
          </motion.div>
        </section>

        {/* Final CTA */}
        <motion.section {...reveal} className="relative z-10 py-28 px-6 text-center max-w-3xl mx-auto">
          <SigmaMark size={64} className="mx-auto mb-8 rounded-[15px] glow-purple" />
          <h2 className="text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
          <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="glow">
              <SigmaMark size={18} tile={false} /> {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </motion.section>

        <MarketingFooter lang={lang} />
      </div>
    </MotionConfig>
  );
}
