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
      <div
        data-tone="light"
        className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
        lang={lang}
      >
        <ScrollProgress />
        <MarketingBackground />
        {/* Hero band — nav + hero on the light page surface */}
        <div className="relative">
          <MarketingNav lang={lang} />

          {/* Hero */}
          <section className="relative z-10 mx-auto max-w-7xl px-6 pt-28 pb-24 text-center md:pt-36 md:pb-28">
            <motion.div
              className="relative z-10"
              initial="hidden"
              animate="visible"
              variants={heroStagger}
            >
              <motion.div variants={heroItem}>
                <div className="brand-soft brand-border mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold [color:var(--signal-blue)]">
                  <span
                    className="brand-bg h-1.5 w-1.5 animate-pulse rounded-full"
                    aria-hidden="true"
                  />
                  {t.badge}
                </div>
              </motion.div>
              <motion.div variants={heroItem}>
                <h1 className="mb-8 text-5xl leading-[1.05] font-bold tracking-tight [color:var(--mk-text)] md:text-7xl">
                  {t.h1a}
                  <br />
                  <span className="whitespace-nowrap [color:var(--brand-primary)]">{t.h1b}</span>
                </h1>
              </motion.div>
              <motion.div variants={heroItem}>
                <p className="mx-auto mb-12 max-w-3xl text-lg leading-normal [color:var(--mk-text-muted)] md:text-xl">
                  {t.sub}
                </p>
              </motion.div>
              <motion.div variants={heroItem}>
                <div className="mb-10 flex flex-col justify-center gap-4 sm:flex-row">
                  <Link href={p(lang, "/signup")}>
                    <Button size="xl" variant="glow" className="min-w-[200px]">
                      {t.ctaPrimary} <SubsumioMark size={18} tile={false} />
                    </Button>
                  </Link>
                  <a href="#demo">
                    <Button
                      size="xl"
                      variant="secondary"
                      className="min-w-[200px] border-[color:var(--mk-border-strong)]"
                    >
                      {t.ctaSecondary} <ChevronRight size={18} />
                    </Button>
                  </a>
                </div>
              </motion.div>
              {/* Micro-trust signals below CTAs — Stripe/Linear pattern */}
              <motion.div variants={heroItem}>
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs [color:var(--mk-text-subtle)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {lang === "de" ? "Keine Kreditkarte" : "No credit card"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {lang === "de" ? "3 Min. zur ersten Antwort" : "3 min to first answer"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {lang === "de" ? "EU-gehostet oder self-hosted" : "EU-hosted or self-hosted"}
                  </span>
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              id="demo"
              className="relative z-10 mx-auto max-w-3xl scroll-mt-24"
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
        <motion.section
          {...reveal}
          data-tone="light"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-6 py-20 [background:var(--mk-surface)]"
        >
          <div className="mx-auto max-w-4xl">
            <StaggerContainer
              className="mb-6 grid grid-cols-2 gap-8 text-center md:grid-cols-4"
              stagger={0.09}
            >
              {t.stats.map((stat) => (
                <StaggerItem key={stat.label}>
                  <p className="mb-1 text-3xl font-black [color:var(--brand-primary)]">
                    {stat.value}
                  </p>
                  <p className="text-sm [color:var(--mk-text-muted)]">{stat.label}</p>
                </StaggerItem>
              ))}
            </StaggerContainer>
            <p className="text-center text-xs [color:var(--mk-text-subtle)]">{t.statsNote}</p>
          </div>
        </motion.section>

        <SuperbrainAdvantage lang={lang} />

        {/* Dashboard in action — light section with dark mockup spotlight */}
        <section data-tone="light" className="relative z-10 mx-auto max-w-5xl px-6 py-28">
          <motion.div {...reveal}>
            <SectionHeading
              badge={lang === "de" ? "In Aktion" : "In action"}
              title={
                lang === "de"
                  ? "Datei anhängen. Fragen. Zitierte Antwort."
                  : "Attach a file. Ask. Cited answer."
              }
              sub={
                lang === "de"
                  ? "Dateien per Upload, Google Drive oder Anwaltssoftware ins Brain — dann im Chat fragen, mit seitengenauen Quellen."
                  : "Bring files in via upload, Google Drive or your practice software — then ask in chat, with page-level sources."
              }
            />
          </motion.div>
          <motion.div {...reveal}>
            <div data-tone="slate">
              <DashboardReel lang={lang} />
            </div>
          </motion.div>
        </section>

        {/* Features — alternating surface band */}
        <section id="features" data-tone="light" className="relative z-10 px-6 py-28">
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal}>
              <SectionHeading badge="Features" title={t.featuresTitle} sub={t.featuresSub} />
            </motion.div>
            <StaggerContainer
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
              stagger={0.07}
              y={16}
            >
              {t.features.map((f) => {
                const Icon = ICONS[f.icon];
                return (
                  <StaggerItem key={f.title}>
                    <GlowCard
                      className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl"
                      style={{ boxShadow: "var(--mk-card-shadow)" } as React.CSSProperties}
                    >
                      <div
                        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg border ${accentTile(f.color, "light")}`}
                      >
                        {Icon && <Icon size={18} />}
                      </div>
                      <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                        {f.title}
                      </h3>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                        {f.desc}
                      </p>
                    </GlowCard>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </section>

        {/* Use cases — real workflows, not fake testimonials */}
        <section
          data-tone="light"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-6 py-24 [background:var(--mk-surface)]"
        >
          <div className="mx-auto max-w-7xl">
            <motion.div {...reveal}>
              <SectionHeading title={t.scenariosTitle} sub={t.scenariosSub} />
            </motion.div>
            <div className="grid gap-6 md:grid-cols-3">
              {t.scenarios.map((s, i) => (
                <motion.div
                  key={s.role}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewport}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="rounded-xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] [background:var(--mk-bg)]"
                >
                  <p className="mb-3 text-xs font-semibold tracking-wider text-[var(--brand-primary)] uppercase">
                    {s.role}
                  </p>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{s.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works — alternating surface band */}
        <section
          data-tone="light"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-6 py-24 [background:var(--mk-surface)]"
        >
          <div className="mx-auto max-w-6xl">
            <motion.div {...reveal}>
              <SectionHeading title={t.howTitle} />
            </motion.div>
            <StaggerContainer
              className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
              stagger={0.08}
              y={18}
            >
              {t.how.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <StaggerItem key={item.step}>
                    <GlowCard
                      className="h-full rounded-xl border [border-color:var(--mk-border)] p-6 transition-all duration-300 [background:var(--mk-bg)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-lg"
                      style={{ boxShadow: "var(--mk-card-shadow)" } as React.CSSProperties}
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <span className="font-mono text-xs [color:var(--mk-text-subtle)]">
                          {item.step}
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/10">
                          {Icon && <Icon size={15} className="text-[var(--brand-primary)]" />}
                        </div>
                      </div>
                      <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                        {item.title}
                      </h3>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                        {item.desc}
                      </p>
                    </GlowCard>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </section>

        {/* Trust band — light section (the serious counterpoint, primes pricing) */}
        <TrustBand lang={lang} />

        {/* Pricing */}
        <section id="pricing" data-tone="light" className="relative z-10 px-6 py-28">
          <motion.div {...reveal} className="mx-auto max-w-6xl">
            <SectionHeading badge="Pricing" title={pricing.title} sub={pricing.sub} />
            <PricingGrid lang={lang} />
            <div className="mt-10 text-center">
              <Link href={p(lang, "/pricing")}>
                <Button size="lg" variant="secondary">
                  {lang === "de" ? "Alle Preisdetails ansehen" : "See full pricing details"}{" "}
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* FAQ — subtle surface band */}
        <section
          data-tone="light"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-6 py-24 [background:var(--mk-surface)]"
        >
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq} />
          </motion.div>
        </section>

        {/* Final CTA */}
        <motion.section
          {...reveal}
          data-tone="light"
          className="relative z-10 mx-auto max-w-3xl px-6 py-32 text-center"
        >
          <SubsumioMark size={64} className="mx-auto mb-8" />
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {t.ctaTitle}
          </h2>
          <p className="mb-10 text-lg [color:var(--mk-text-muted)]">{t.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="glow">
              <SubsumioMark size={18} tile={false} /> {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs [color:var(--mk-text-subtle)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              {lang === "de" ? "Keine Kreditkarte" : "No credit card"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              {lang === "de" ? "DSGVO-konform" : "GDPR-ready"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
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
