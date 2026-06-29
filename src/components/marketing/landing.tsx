"use client";

// Subsumio landing page — renders EN or DE from src/content/site.ts.
// Agency-grade motion: load-in hero, scroll-reveal sections, staggered cards,
// interactive live demo, parallax background (via MarketingBackground). All
// decorative motion respects prefers-reduced-motion via MotionConfig.

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { LANDING, PRICING, UI_STRINGS, p, type Lang } from "@/content/site";
import { PricingGrid } from "./pricing-grid";
import LiveDemo from "./live-demo";
import DashboardReel from "./dashboard-reel";
import SuperbrainAdvantage from "./superbrain-advantage";
import TrustBand from "./trust-band";
import { TestimonialsSection } from "./testimonials";
import AudienceTabs from "./audience-tabs";
import { Section, SectionHeading, ICONS, accentTile } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import {
  GlowCard,
  StaggerContainer,
  StaggerItem,
  EASE,
  ScrollProgress,
  AnimatedCounter,
  MagneticButton,
  MagneticCard,
  TextReveal,
  GradientMesh,
  SplitTextReveal,
} from "./motion-system";
import IndustryHeroMotif from "./industry-hero-motif";
import { WhatsAppSpotlight } from "./subsumio-showcase";
import ProductWorkflowShowcase from "./product-workflow-showcase";

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;

// Section/card scroll-reveal preset.
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: EASE.out },
};

export default function LandingPage({ lang }: { lang: Lang }) {
  const t = (LANDING as Record<string, typeof LANDING.de>)[lang] ?? LANDING.de;
  const pricing = PRICING[lang];
  const ui = UI_STRINGS[lang];
  const reduce = useReducedMotion();

  return (
    <>
      <ScrollProgress />
      <div
        data-tone="light"
        className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
        lang={lang}
      >
        {/* Hero — dark slate editorial surface for stronger contrast */}
        <Section tone="slate" className="relative px-6 pt-16 pb-24">
          <div className="relative mx-auto max-w-7xl text-center">
            {/* Legal icon constellation — animated hero motif */}
            <IndustryHeroMotif
              industry="legal"
              className="absolute inset-0 z-0 hidden opacity-[0.10] md:block"
            />
            <div className="relative z-10">
              <motion.div
                initial={reduce ? false : { scale: 0.8, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 18, delay: 0 }}
                className="mb-6"
              >
                <SubsumioMark size={56} className="mx-auto" />
              </motion.div>
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.45, ease: EASE.out, delay: 0.15 }}
                className="brand-border brand-soft brand-text mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
              >
                <span className="badge-pulse h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />
                {lang !== "en"
                  ? "KI-Kanzleisoftware für AT · DE · CH"
                  : "AI legal software for AT · DE · CH"}
              </motion.div>
              <h1
                className="mb-6 text-5xl leading-[1.05] font-black tracking-tight [color:var(--mk-text)] md:text-7xl lg:text-8xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <SplitTextReveal
                  splitBy="char"
                  stagger={0.035}
                  delay={0.1}
                  as="span"
                  className="block"
                >
                  Subsumio
                </SplitTextReveal>
                <SplitTextReveal
                  splitBy="char"
                  stagger={0.04}
                  delay={0.35}
                  as="span"
                  className="gradient-text-animated block"
                >
                  {lang !== "en" ? "Das Kanzlei-Brain." : "The firm brain."}
                </SplitTextReveal>
              </h1>
              <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)] md:text-xl">
                {t.sub}
              </p>
              <div className="mb-4 flex flex-col justify-center gap-4 sm:flex-row">
                <MagneticButton strength={0.25}>
                  <Link href={p(lang, "/signup")}>
                    <Button size="xl" variant="glow" className="min-w-[220px]">
                      <SubsumioMark size={18} tile={false} /> {t.ctaPrimary}
                    </Button>
                  </Link>
                </MagneticButton>
                <a href="#pricing">
                  <Button size="xl" variant="ghost" className="min-w-[200px]">
                    {lang !== "en" ? "Preise ansehen" : "See pricing"} <ArrowRight size={18} />
                  </Button>
                </a>
              </div>
              <p className="mb-4 text-xs [color:var(--mk-text-subtle)]">
                {lang !== "en"
                  ? "14 Tage Reverse Trial · 14 Tage Geld-zurück-Garantie · Keine Kreditkarte erforderlich"
                  : "14-day reverse trial · 14-day money-back guarantee · No credit card required"}
              </p>
              {/* The live demo is a dark spotlight floating on the slate hero */}
              <div
                id="demo"
                data-tone="dashboard"
                className="mx-auto max-w-3xl scroll-mt-24 rounded-2xl shadow-[0_0_60px_rgba(56,189,248,0.12)] ring-1 ring-white/[0.08]"
              >
                <LiveDemo lang={lang} {...t.demo} />
              </div>
            </div>
          </div>
        </Section>

        {/* Stats — subtle surface band on the light page */}
        <Section tone="light" className="border-y px-4 py-20 sm:px-6 lg:px-8">
          <motion.div {...reveal} className="mx-auto max-w-4xl">
            <StaggerContainer
              className="mb-6 grid grid-cols-2 gap-8 text-center md:grid-cols-4"
              stagger={0.09}
            >
              {t.stats.map((stat) => {
                const num = parseFloat(stat.value.replace(/[^0-9.]/g, ""));
                const suffix = stat.value.replace(/[0-9.,]/g, "");
                const prefix = stat.value.match(/^[^0-9]*/)?.[0] ?? "";
                const isNumeric = !isNaN(num) && num > 0;
                return (
                  <StaggerItem key={stat.label}>
                    <p className="mb-1 text-3xl font-black [color:var(--brand-text)]">
                      {isNumeric ? (
                        <AnimatedCounter
                          to={num}
                          prefix={prefix}
                          suffix={suffix}
                          decimals={stat.value.includes(".") ? 1 : 0}
                        />
                      ) : (
                        stat.value
                      )}
                    </p>
                    <p className="text-sm [color:var(--mk-text-muted)]">{stat.label}</p>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
            <p className="text-center text-xs [color:var(--mk-text-subtle)]">{t.statsNote}</p>
          </motion.div>
        </Section>

        {/* Pain — problem hook (light, border-y separates from stats above) */}
        {"pains" in t && t.pains && (
          <Section tone="light" className="border-y px-4 py-24 sm:px-6 lg:px-8">
            <motion.div {...reveal} className="mx-auto max-w-5xl">
              <SectionHeading
                title={(t as { painTitle: string }).painTitle}
                sub={(t as { painSub: string }).painSub}
              />
              <StaggerContainer
                className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2"
                stagger={0.08}
              >
                {(t as { pains: { value: string; label: string }[] }).pains.map((p) => (
                  <StaggerItem key={p.label}>
                    <div className="flex items-start gap-4 rounded-xl border [border-color:var(--mk-border)] p-5 [background:var(--mk-surface)]">
                      <p className="text-2xl font-black [color:var(--brand-text)]">{p.value}</p>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                        {p.label}
                      </p>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </motion.div>
          </Section>
        )}

        <SuperbrainAdvantage lang={lang} />

        {/* Features — what it does (light, after unique mechanism) */}
        <Section tone="light" id="features" className="px-4 py-24 sm:px-6 lg:px-8">
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
        </Section>

        {/* Dashboard in action — product visual showing features in action */}
        <Section tone="slate" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <motion.div {...reveal}>
              <SectionHeading
                badge={ui.inActionBadge}
                title={ui.dashboardTitle}
                sub={ui.dashboardSub}
              />
            </motion.div>
            <motion.div {...reveal}>
              <MagneticCard lift={8} tilt={2} className="rounded-2xl">
                <div data-tone="dashboard">
                  <DashboardReel lang={lang} />
                </div>
              </MagneticCard>
            </motion.div>
          </div>
        </Section>

        {/* How it works — animated scroll-driven workflow showcase */}
        <ProductWorkflowShowcase lang={lang} industry="legal" />

        {/* WhatsApp Copilot — dark spotlight with animated phone mockup */}
        <WhatsAppSpotlight lang={lang} />

        {/* Use cases — who it's for (slate for rhythm) */}
        <Section tone="slate" className="border-y px-4 py-24 sm:px-6 lg:px-8">
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
                  className="rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] [background:var(--mk-bg)]"
                >
                  <p className="mb-3 text-xs font-semibold tracking-wider [color:var(--brand-text)] uppercase">
                    {s.role}
                  </p>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{s.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </Section>

        {/* Audience segments — homepage teaser linking to /solutions/* */}
        <AudienceTabs lang={lang} />

        {/* Trust band — light section (primes comparison + pricing) */}
        <TrustBand lang={lang} />

        {/* Testimonials — social proof from real lawyers */}
        <TestimonialsSection />

        {/* Comparison table — Subsumio vs. other AI tools (light, before pricing to justify) */}
        <Section tone="light" className="border-y px-4 py-24 sm:px-6 lg:px-8">
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.comparisonTitle} sub={t.comparisonSub} />
            <div className="overflow-x-auto">
              <table className="mt-10 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--mk-border)]">
                    <th className="py-3 pr-4 text-left font-semibold text-[color:var(--mk-text)]">
                      {lang === "en" ? "Feature" : "Feature"}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--brand-text)]">
                      Subsumio
                    </th>
                    <th className="py-3 pl-4 text-left font-semibold text-[color:var(--mk-text-subtle)]">
                      {lang === "en" ? "Other AI tools" : "Andere KI-Tools"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {t.comparison.map((row, i) => (
                    <motion.tr
                      key={row.feature}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                      className="border-b border-[color:var(--mk-border)] last:border-0"
                    >
                      <td className="py-4 pr-4 font-medium text-[color:var(--mk-text)]">
                        {row.feature}
                      </td>
                      <td className="px-4 py-4 text-[color:var(--mk-text-muted)]">
                        <span className="inline-flex items-start gap-2">
                          <span
                            className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--signal-green)]"
                            aria-hidden
                          />
                          {row.subsumio}
                        </span>
                      </td>
                      <td className="py-4 pl-4 text-[color:var(--mk-text-subtle)]">
                        <span className="inline-flex items-start gap-2">
                          <span
                            className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--mk-text-subtle)] opacity-40"
                            aria-hidden
                          />
                          {row.others}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </Section>

        {/* Pricing */}
        <Section tone="light" id="pricing" className="px-4 py-24 sm:px-6 lg:px-8">
          <motion.div {...reveal} className="mx-auto max-w-6xl">
            <SectionHeading badge="Pricing" title={pricing.title} sub={pricing.sub} />
            <PricingGrid lang={lang} />
            <div className="mt-10 text-center">
              <Link href={p(lang, "/pricing")}>
                <Button size="lg" variant="secondary">
                  {ui.seeFullPricing} <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </motion.div>
        </Section>

        {/* FAQ — slate band for tone rhythm (breaks light→light→light) */}
        <Section tone="slate" className="px-4 py-24 sm:px-6 lg:px-8">
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.faqTitle} />
            <AnimatedFaqList items={t.faq} tone="slate" />
          </motion.div>
        </Section>

        {/* Final CTA — dark spotlight close with gradient mesh */}
        <Section
          tone="dark"
          className="relative overflow-hidden px-4 py-24 text-center sm:px-6 lg:px-8"
        >
          <GradientMesh className="opacity-40" />
          <motion.div {...reveal} className="mx-auto max-w-3xl text-center">
            <SubsumioMark size={56} className="mx-auto mb-7" />
            <TextReveal
              as="h2"
              text={t.ctaTitle}
              className="mb-4 text-3xl font-black [color:var(--mk-text)] [font-family:var(--font-display)] md:text-4xl"
              wordClassName="inline-block"
            />
            <p className="mb-10 text-lg [color:var(--mk-text-muted)]">{t.ctaSub}</p>
            <MagneticButton strength={0.25}>
              <Link href={p(lang, "/signup")}>
                <Button size="xl" variant="glow">
                  <SubsumioMark size={18} tile={false} /> {t.ctaButton} <ArrowRight size={18} />
                </Button>
              </Link>
            </MagneticButton>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs [color:var(--mk-text-subtle)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[color:var(--signal-green)]" />
                {ui.noCreditCard}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[color:var(--signal-green)]" />
                {ui.gdprReady}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[color:var(--signal-green)]" />
                {ui.professionalSecrecy}
              </span>
            </div>
            {t.relatedLinks && (
              <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
                {t.relatedLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-[color:var(--mk-text-subtle)] underline decoration-[color:var(--mk-border)] underline-offset-4 transition-colors hover:text-[color:var(--mk-text)] hover:decoration-[color:var(--brand-text)]"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}
          </motion.div>
        </Section>
      </div>
    </>
  );
}
