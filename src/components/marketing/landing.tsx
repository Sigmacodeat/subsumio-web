"use client";

// Subsumio landing page — renders EN or DE from src/content/site.ts.
// Agency-grade motion: load-in hero, scroll-reveal sections, staggered cards,
// interactive live demo, parallax background (via MarketingBackground). All
// decorative motion respects prefers-reduced-motion via MotionConfig.

import Link from "next/link";
import { motion, MotionConfig, type Variants } from "framer-motion";
import { ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { LANDING, PRICING, p, type Lang } from "@/content/site";
import { PricingGrid } from "./pricing-grid";
import LiveDemo from "./live-demo";
import DashboardReel from "./dashboard-reel";
import SuperbrainAdvantage from "./superbrain-advantage";
import TrustBand from "./trust-band";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  SectionHeading,
  FaqList,
  ICONS,
  accentTile,
} from "./chrome";
import { GlowCard, StaggerContainer, StaggerItem, ScrollProgress, EASE } from "./motion-system";
import BackToTop from "./back-to-top";

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;

// Section/card scroll-reveal preset.
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: "easeOut" as const },
};

const heroStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE.out },
  },
};

export default function LandingPage({ lang }: { lang: Lang }) {
  const t = LANDING[lang];
  const pricing = PRICING[lang];

  return (
    <MotionConfig reducedMotion="user">
      <div data-tone="light" className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>
        <ScrollProgress />
        <MarketingBackground />
        {/* Hero band — nav + hero on the light page surface */}
        <div className="relative">
        <MarketingNav lang={lang} theme="light" />

        {/* Hero */}
        <section className="relative z-10 pt-28 md:pt-36 pb-24 md:pb-28 px-6 max-w-7xl mx-auto text-center">
          <motion.div
            className="relative z-10"
            initial="hidden"
            animate="visible"
            variants={heroStagger}
          >
            <motion.div variants={heroItem}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 brand-soft [color:var(--signal-blue)] border brand-border">
                <span className="w-1.5 h-1.5 rounded-full brand-bg animate-pulse" aria-hidden="true" />
                {t.badge}
              </div>
            </motion.div>
            <motion.div variants={heroItem}>
              <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-8 [color:var(--mk-text)]">
                {t.h1a}<br />
                <span className="whitespace-nowrap [color:var(--brand-primary)]">{t.h1b}</span>
              </h1>
            </motion.div>
            <motion.div variants={heroItem}>
              <p className="text-lg md:text-xl max-w-3xl mx-auto mb-12 leading-normal [color:var(--mk-text-muted)]">{t.sub}</p>
            </motion.div>
            <motion.div variants={heroItem}>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
                <Link href={p(lang, "/signup")}>
                  <Button size="xl" variant="glow" className="min-w-[200px]">
                    {t.ctaPrimary} <SubsumioMark size={18} tile={false} />
                  </Button>
                </Link>
                <a href="#demo">
                  <Button size="xl" variant="secondary" className="min-w-[200px] border-[color:var(--mk-border-strong)]">
                    {t.ctaSecondary} <ChevronRight size={18} />
                  </Button>
                </a>
              </div>
            </motion.div>
            {/* Micro-trust signals below CTAs — Stripe/Linear pattern */}
            <motion.div variants={heroItem}>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs [color:var(--mk-text-subtle)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {lang === "de" ? "Keine Kreditkarte" : "No credit card"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {lang === "de" ? "3 Min. zur ersten Antwort" : "3 min to first answer"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {lang === "de" ? "EU-gehostet oder self-hosted" : "EU-hosted or self-hosted"}
                </span>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            id="demo"
            className="relative z-10 max-w-3xl mx-auto scroll-mt-24"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            role="region"
            aria-label={lang === "de" ? "Live-Demo" : "Live demo"}
          >
            {/* Pin the demo mockup to slate so it keeps its terminal look
                without a harsh black-to-light contrast jump. */}
            <div data-tone="slate">
              <LiveDemo lang={lang} {...t.demo} />
            </div>
          </motion.div>
        </section>
        </div>

        {/* Stats — subtle surface band on the light page */}
        <motion.section {...reveal} data-tone="light" className="relative z-10 py-20 px-6 border-y [border-color:var(--mk-border)] [background:var(--mk-surface)]">
          <div className="max-w-4xl mx-auto">
            <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center mb-6" stagger={0.09}>
              {t.stats.map((stat) => (
                <StaggerItem key={stat.label}>
                  <p className="text-3xl font-black [color:var(--brand-primary)] mb-1">{stat.value}</p>
                  <p className="text-sm [color:var(--mk-text-muted)]">{stat.label}</p>
                </StaggerItem>
              ))}
            </StaggerContainer>
            <p className="text-center text-xs [color:var(--mk-text-subtle)]">{t.statsNote}</p>
          </div>
        </motion.section>

        <SuperbrainAdvantage lang={lang} />

        {/* Dashboard in action — light section with dark mockup spotlight */}
        <section data-tone="light" className="relative z-10 py-28 px-6 max-w-5xl mx-auto">
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
            <div data-tone="slate">
              <DashboardReel lang={lang} />
            </div>
          </motion.div>
        </section>

        {/* Features — alternating surface band */}
        <section id="features" data-tone="light" className="relative z-10 py-28 px-6">
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
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-4 ${accentTile(f.color, "light")}`}>
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

        {/* How it works — alternating surface band */}
        <section data-tone="light" className="relative z-10 py-24 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-5xl mx-auto">
            <motion.div {...reveal}><SectionHeading title={t.howTitle} /></motion.div>
            <StaggerContainer className="grid md:grid-cols-3 gap-6" stagger={0.1} y={18}>
              {t.how.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <StaggerItem key={item.step}>
                    <GlowCard
                      className="h-full p-6 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] transition-all duration-300 hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-lg"
                      style={{ boxShadow: "var(--mk-card-shadow)" } as React.CSSProperties}
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

        {/* Scenarios (honest — no fake testimonials) — subtle surface band */}
        <section data-tone="light" className="relative z-10 py-24 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
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
                  className="p-6 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] [box-shadow:var(--mk-card-shadow)]"
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
        <section id="pricing" data-tone="light" className="relative z-10 py-28 px-6">
          <motion.div {...reveal} className="max-w-6xl mx-auto">
            <SectionHeading badge="Pricing" title={pricing.title} sub={pricing.sub} />
            <PricingGrid lang={lang} />
            <div className="text-center mt-10">
              <Link href={p(lang, "/pricing")}>
                <Button size="lg" variant="secondary">
                  {lang === "de" ? "Alle Preisdetails ansehen" : "See full pricing details"} <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* FAQ — subtle surface band */}
        <section data-tone="light" className="relative z-10 py-24 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <motion.div {...reveal} className="max-w-5xl mx-auto">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq} />
          </motion.div>
        </section>

        {/* Final CTA */}
        <motion.section {...reveal} data-tone="light" className="relative z-10 py-32 px-6 text-center max-w-3xl mx-auto">
          <SubsumioMark size={64} className="mx-auto mb-8" />
          <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
          <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="glow">
              <SubsumioMark size={18} tile={false} /> {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs [color:var(--mk-text-subtle)] mt-8">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              {lang === "de" ? "Keine Kreditkarte" : "No credit card"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              {lang === "de" ? "DSGVO-konform" : "GDPR-ready"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              {lang === "de" ? "§ 203 StGB im Blick" : "Professional secrecy by design"}
            </span>
          </div>
        </motion.section>

        <MarketingFooter lang={lang} />
        <BackToTop lang={lang} />
      </div>
    </MotionConfig>
  );
}
