"use client";

// Subsumio landing page — renders EN or DE from src/content/site.ts.
// Agency-grade motion: load-in hero, scroll-reveal sections, staggered cards,
// interactive live demo, parallax background (via MarketingBackground). All
// decorative motion respects prefers-reduced-motion via MotionConfig.

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { LANDING, PRICING, UI_STRINGS, p, type Lang } from "@/content/site";
import { PricingGrid } from "./pricing-grid";
import LiveDemo from "./live-demo";
import DashboardReel from "./dashboard-reel";
import SuperbrainAdvantage from "./superbrain-advantage";
import TrustBand from "./trust-band";
import { TestimonialsSection } from "./testimonials";
import { useHeroVariant, HERO_VARIANTS } from "@/lib/ab-test";
import AudienceTabs from "./audience-tabs";
import { SectionHeading, ICONS, accentTile } from "./chrome";
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
} from "./motion-system";

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;

// Section/card scroll-reveal preset.
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: EASE.out },
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

const h1Container: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const h1Word: Variants = {
  hidden: { clipPath: "inset(100% 0% 0% 0%)", opacity: 0 },
  visible: {
    clipPath: "inset(0% 0% 0% 0%)",
    opacity: 1,
    transition: { duration: 0.6, ease: EASE.dramatic },
  },
};

const trustContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const trustItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE.out } },
};

export default function LandingPage({ lang }: { lang: Lang }) {
  const t = (LANDING as Record<string, typeof LANDING.de>)[lang] ?? LANDING.de;
  const pricing = PRICING[lang];
  const ui = UI_STRINGS[lang];
  const reduce = useReducedMotion();
  const heroVariant = useHeroVariant();
  const heroText = HERO_VARIANTS[heroVariant][lang === "en" ? "en" : "de"];
  const h1a = heroText.h1a;
  const h1b = heroText.h1b;

  return (
    <>
      <ScrollProgress />
      <div
        data-tone="light"
        className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
        lang={lang}
      >
        {/* Hero band — hero on the light page surface */}
        <div className="relative">
          {/* Hero */}
          <section className="relative z-10 mx-auto max-w-7xl px-4 pt-28 pb-24 text-center sm:px-6 md:pt-36 md:pb-28 lg:px-8">
            {/* Aurora wash — local to hero */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 80% 50% at 30% 20%, color-mix(in srgb, var(--brand-primary) 9%, transparent), transparent 70%)",
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 40% at 70% 80%, color-mix(in srgb, var(--brand-secondary) 8%, transparent), transparent 70%)",
                }}
              />
            </div>
            <motion.div
              className="relative z-10"
              initial="hidden"
              animate="visible"
              variants={heroStagger}
            >
              <motion.div variants={heroItem}>
                <div className="brand-soft brand-border mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold [color:var(--signal-blue)]">
                  <motion.span
                    className="brand-bg h-1.5 w-1.5 rounded-full"
                    aria-hidden="true"
                    animate={
                      reduce
                        ? undefined
                        : {
                            scale: [1, 1.3, 1],
                            opacity: [0.7, 1, 0.7],
                          }
                    }
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  {t.badge}
                </div>
              </motion.div>
              <motion.div variants={heroItem}>
                <motion.h1
                  className="mb-8 text-[clamp(2.75rem,12vw,4.5rem)] leading-[1.05] font-black tracking-tight text-balance [color:var(--mk-text)] md:text-7xl"
                  variants={h1Container}
                >
                  {reduce ? (
                    <>
                      {h1a}
                      <br />
                      <span className="hero-gradient-text whitespace-nowrap">{h1b}</span>
                    </>
                  ) : (
                    <>
                      {h1a.split(" ").map((word, i) => (
                        <motion.span key={i} className="inline-block" variants={h1Word}>
                          {word}
                          {i < h1a.split(" ").length - 1 ? " " : ""}
                        </motion.span>
                      ))}
                      <span className="sr-only"> </span>
                      <br />
                      <motion.span className="hero-gradient-text inline-block" variants={h1Word}>
                        {h1b}
                      </motion.span>
                    </>
                  )}
                </motion.h1>
              </motion.div>
              {"h1Keyword" in t && (t as { h1Keyword?: string }).h1Keyword && (
                <p className="mt-3 text-sm font-medium text-[color:var(--mk-text-subtle)]">
                  {(t as { h1Keyword: string }).h1Keyword}
                </p>
              )}
              <motion.div variants={heroItem}>
                <p className="mx-auto mb-12 max-w-3xl text-lg leading-normal [color:var(--mk-text-muted)] md:text-xl">
                  {t.sub}
                </p>
              </motion.div>
              <motion.div variants={heroItem}>
                <div className="mb-10 flex flex-col justify-center gap-4 sm:flex-row">
                  <MagneticButton strength={0.25}>
                    <Link href={p(lang, "/signup")}>
                      <Button size="xl" variant="glow" className="min-w-[200px]">
                        {t.ctaPrimary} <SubsumioMark size={18} tile={false} />
                      </Button>
                    </Link>
                  </MagneticButton>
                  <MagneticButton strength={0.2}>
                    <a href="#demo">
                      <Button
                        size="xl"
                        variant="secondary"
                        className="min-w-[200px] border-[color:var(--mk-border-strong)]"
                      >
                        {t.ctaSecondary} <ChevronRight size={18} />
                      </Button>
                    </a>
                  </MagneticButton>
                </div>
              </motion.div>
              {/* Micro-trust signals below CTAs — Stripe/Linear pattern */}
              <motion.div variants={heroItem}>
                <motion.div
                  className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs [color:var(--mk-text-subtle)]"
                  variants={trustContainer}
                >
                  {[ui.noCreditCard, ui.threeMinAnswer, ui.euHosted].map((label) => (
                    <motion.span
                      key={label}
                      className="inline-flex items-center gap-1.5"
                      variants={trustItem}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[color:var(--signal-green)]"
                        aria-hidden="true"
                      />
                      {label}
                    </motion.span>
                  ))}
                </motion.div>
              </motion.div>
            </motion.div>

            <motion.div
              id="demo"
              className="relative z-10 mx-auto max-w-3xl scroll-mt-24"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE.out, delay: 0.15 }}
              role="region"
              aria-label={ui.liveDemoAria}
            >
              {/* Pin the demo mockup to the dashboard tone so it matches
                the real product's color palette exactly. */}
              <div data-tone="dashboard">
                <LiveDemo lang={lang} {...t.demo} />
              </div>
            </motion.div>
          </section>
        </div>

        {/* Stats — subtle surface band on the light page */}
        <motion.section
          {...reveal}
          data-tone="light"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-4xl">
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
          </div>
        </motion.section>

        {/* Pain — problem hook before solution */}
        {"pains" in t && t.pains && (
          <motion.section
            {...reveal}
            data-tone="light"
            className="relative z-10 px-4 py-20 sm:px-6 lg:px-8"
          >
            <div className="mx-auto max-w-5xl">
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
            </div>
          </motion.section>
        )}

        <SuperbrainAdvantage lang={lang} />

        {/* Dashboard in action — light section with dark mockup spotlight */}
        <section
          data-tone="light"
          className="relative z-10 mx-auto max-w-5xl px-4 py-28 sm:px-6 lg:px-8"
        >
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
        </section>

        {/* Features — alternating surface band */}
        <section
          id="features"
          data-tone="light"
          className="relative z-10 px-4 py-28 sm:px-6 lg:px-8"
        >
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
          data-tone="slate"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8"
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
        </section>

        {/* Audience segments — homepage teaser linking to /solutions/* */}
        <AudienceTabs lang={lang} />

        {/* How it works — alternating surface band */}
        <section
          data-tone="light"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8"
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
                      className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all duration-300 [background:var(--mk-bg)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-lg"
                      style={{ boxShadow: "var(--mk-card-shadow)" } as React.CSSProperties}
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <span className="font-mono text-xs [color:var(--mk-text-subtle)]">
                          {item.step}
                        </span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--brand-text)]/20 bg-[var(--brand-text)]/10">
                          {Icon && <Icon size={15} className="[color:var(--brand-text)]" />}
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

        {/* Testimonials — social proof from real lawyers */}
        <TestimonialsSection />

        {/* Pricing */}
        <section
          id="pricing"
          data-tone="light"
          className="relative z-10 px-4 py-28 sm:px-6 lg:px-8"
        >
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
        </section>

        {/* Comparison table — Subsumio vs. other AI tools */}
        <section data-tone="slate" className="relative z-10 px-4 py-24 sm:px-6 lg:px-8">
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
        </section>

        {/* FAQ — subtle surface band */}
        <section
          data-tone="light"
          className="relative z-10 border-y [border-color:var(--mk-border)] px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8"
        >
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.faqTitle} />
            <AnimatedFaqList items={t.faq} tone="light" />
          </motion.div>
        </section>

        {/* Final CTA */}
        <motion.section
          {...reveal}
          data-tone="light"
          className="relative z-10 mx-auto max-w-3xl px-4 py-28 text-center sm:px-6 lg:px-8"
        >
          <SubsumioMark size={56} className="mx-auto mb-7" />
          <TextReveal
            as="h2"
            text={t.ctaTitle}
            className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl"
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
        </motion.section>
      </div>
    </>
  );
}
