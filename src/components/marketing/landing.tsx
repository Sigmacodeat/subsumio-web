"use client";

// Subsumio landing page — renders localized content from src/content/site.ts.
// Refined, law-firm-appropriate motion: subtle load-in hero, scroll-reveal
// sections, staggered cards, interactive live demo. Decorative effects are
// intentionally restrained to project trust and seriousness. All motion respects
// prefers-reduced-motion.

import { useState } from "react";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { LANDING, PRICING, UI_STRINGS, p, type Lang } from "@/content/site";
import { PricingGrid } from "./pricing-grid";
import LiveDemo from "./live-demo";
import ScrollPinnedDashboard from "./scroll-pinned-dashboard";
import SuperbrainAdvantage from "./superbrain-advantage";
import TrustBand from "./trust-band";
import { TestimonialsSection } from "./testimonials";
import AudienceTabs from "./audience-tabs";
import { Section, SectionHeading, SectionTransition, ICONS, accentTile } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import {
  GlowCard,
  StaggerContainer,
  StaggerItem,
  EASE,
  AnimatedCounter,
  MagneticButton,
  ScrollProgress,
  SplitTextReveal,
  GradientMesh,
} from "./motion-system";
import IndustryHeroMotif from "./industry-hero-motif";
import { WhatsAppSpotlight } from "./subsumio-showcase";
import ProductWorkflowShowcase from "./product-workflow-showcase";
import LogoMarquee from "./logo-marquee";

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;

// Section/card scroll-reveal preset — subtle scale + Y for depth.
const reveal = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport,
  transition: { duration: 0.5, ease: EASE.out },
};

export default function LandingPage({ lang }: { lang: Lang }) {
  const t = (LANDING as Record<string, typeof LANDING.de>)[lang] ?? LANDING.de;
  const pricing = PRICING[lang];
  const ui = UI_STRINGS[lang];
  const reduce = useReducedMotion();

  // Subtle parallax for hero background motif (0.3x speed, transform-only)
  const { scrollYProgress: heroScrollProgress } = useScroll({
    offset: ["start start", "end start"],
  });
  const motifY = useTransform(heroScrollProgress, [0, 1], [0, reduce ? 0 : 120]);
  const motifOpacity = useTransform(heroScrollProgress, [0, 0.8], [0.06, 0]);

  // Sticky CTA visibility — appears after hero scrolls past. Driven by
  // useMotionValueEvent (fires only on scroll change) with a threshold-crossing
  // guard so React re-renders at most twice (show/hide), not once per frame —
  // keeps INP healthy vs. a raw scroll listener + per-frame setState.
  const { scrollY: globalScrollY } = useScroll();
  const [stickyVisible, setStickyVisible] = useState(false);
  useMotionValueEvent(globalScrollY, "change", (latest) => {
    const shouldShow = latest > 600;
    setStickyVisible((prev) => (prev === shouldShow ? prev : shouldShow));
  });

  return (
    <>
      <ScrollProgress />
      {/* overflow-x-CLIP (not -hidden): `hidden` forces overflow-y to `auto`,
          turning this wrapper into a scroll container that silently breaks every
          `position: sticky` descendant (the scroll-pinned dashboard never pinned).
          `clip` clips the horizontal marquee/parallax overflow without
          establishing a scroll container, so sticky works. */}
      <div data-tone="light" className="min-h-screen overflow-x-clip" lang={lang}>
        {/* Hero — clean dark slate editorial surface with subtle motif */}
        <Section
          tone="slate"
          className="relative overflow-hidden px-6 pt-28 pb-28 md:pt-36 md:pb-32"
        >
          <div className="relative mx-auto max-w-7xl text-center">
            {/* Legal icon constellation — subtle parallax background motif */}
            <motion.div
              style={{ y: motifY, opacity: motifOpacity }}
              className="absolute inset-0 z-0 hidden md:block"
            >
              <IndustryHeroMotif industry="legal" className="h-full w-full opacity-[1]" />
            </motion.div>
            <div className="relative z-10">
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0 }}
                className="mb-6"
              >
                <SubsumioMark size={56} className="mx-auto" />
              </motion.div>
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.15 }
                }
                className="mb-8 inline-flex items-center gap-2 rounded-full border [border-color:var(--brand-border)] px-3 py-1.5 text-xs font-medium [color:var(--brand-text)] [background:var(--brand-soft)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />
                {t.badge}
              </motion.div>
              <h1
                className="mb-6 text-[clamp(2.5rem,7vw,4rem)] leading-[1.08] font-black tracking-tight [color:var(--mk-text)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <SplitTextReveal as="span" delay={0.2} stagger={0.08} useAnimate className="block">
                  {`${t.h1a}\n${t.h1b}`}
                </SplitTextReveal>
              </h1>
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.4 }
                }
                className="mx-auto mb-12 max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
              >
                {t.sub}
              </motion.p>
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.out, delay: 0.55 }
                }
                className="mb-4 flex flex-col justify-center gap-4 sm:flex-row"
              >
                <MagneticButton strength={0.25}>
                  <Link href={p(lang, "/signup")}>
                    <Button size="xl" variant="primary" className="min-w-[220px]">
                      {t.ctaPrimary} <ArrowRight size={18} />
                    </Button>
                  </Link>
                </MagneticButton>
                <Link href="#pricing">
                  <Button size="xl" variant="secondary" className="min-w-[200px]">
                    {lang !== "en" ? "Preise ansehen" : "See pricing"}
                  </Button>
                </Link>
              </motion.div>
              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.dramatic, delay: 0.75 }
                }
                className="mb-4 text-xs [color:var(--mk-text-muted)]"
              >
                {lang !== "en"
                  ? "14 Tage Reverse Trial · Geld-zurück-Garantie · Keine Kreditkarte"
                  : "14-day reverse trial · Money-back guarantee · No credit card"}
              </motion.p>
              {/* The live demo — dark spotlight with clear visual separation from hero */}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.55, ease: EASE.dramatic, delay: 0.85 }
                }
                id="demo"
                data-tone="dashboard"
                className="mx-auto mt-6 max-w-3xl scroll-mt-24 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.08]"
              >
                <LiveDemo lang={lang} {...t.demo} />
              </motion.div>
            </div>
          </div>
        </Section>

        {/* Logo Marquee — certifications & integrations sliding from right to left */}
        <LogoMarquee lang={lang} />

        {/* Pain — agitation hook. Comes directly after the hero trust strip so
            the emotional cost lands BEFORE the proof band (P-A-S-P narrative). */}
        {"pains" in t && t.pains && (
          <Section
            tone="light"
            className="px-4 py-24 sm:px-6 lg:px-8"
            aria-label={lang === "en" ? "The cost of doing nothing" : "Was es dich kostet"}
          >
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
                    <GlowCard
                      glowColor="var(--signal-rose)"
                      intensity={0.1}
                      className="h-full rounded-xl border [border-color:var(--mk-border)] p-5 transition-all duration-300 [background:var(--mk-surface-2)] hover:-translate-y-1 hover:shadow-lg"
                    >
                      <div className="flex items-start gap-4">
                        <p className="w-[88px] shrink-0 text-2xl leading-[1.1] font-black tracking-tight text-balance [color:var(--brand-text)]">
                          {p.value}
                        </p>
                        <p className="text-sm leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                          {p.label}
                        </p>
                      </div>
                    </GlowCard>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </motion.div>
          </Section>
        )}

        {/* Stats — proof band. Answers the agitation above with hard metrics. */}
        <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8" aria-label="Key metrics">
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
                    <p className="mb-1 text-4xl font-black [color:var(--brand-text)] md:text-5xl">
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

        {/* Gradient transition: light Stats → slate SuperbrainAdvantage */}
        <SectionTransition from="var(--tone-light-bg)" to="var(--tone-slate-bg)" height={72} />

        <SuperbrainAdvantage lang={lang} />

        {/* Gradient transition: slate SuperbrainAdvantage → light Features */}
        <SectionTransition from="var(--tone-slate-bg)" to="var(--tone-light-bg)" height={72} />

        {/* Features — what it does (light, after unique mechanism) */}
        <Section
          tone="light"
          id="features"
          className="px-4 py-24 sm:px-6 lg:px-8"
          aria-label="Features"
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
                      <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                        {f.title}
                      </h3>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)] md:text-base">
                        {f.desc}
                      </p>
                    </GlowCard>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </Section>

        {/* Dashboard in action — scroll-pinned zoom with guided cursor.
            Kept on the light page: the 200vh sticky viewport is taller than the
            reel, so a dark/slate frame would expose a large empty void below the
            pinned dashboard. Run 1 already closes on the WhatsApp dark spotlight,
            so no extra tone anchor is needed here. */}
        <ScrollPinnedDashboard
          lang={lang}
          badge={ui.inActionBadge}
          title={ui.dashboardTitle}
          sub={ui.dashboardSub}
        />

        {/* How it works — animated scroll-driven workflow showcase */}
        <ProductWorkflowShowcase lang={lang} industry="legal" />

        {/* WhatsApp Copilot — dark spotlight with animated phone mockup */}
        <WhatsAppSpotlight lang={lang} />

        {/* Use cases — who it's for (slate for rhythm) */}
        <Section
          tone="light"
          className="px-4 py-24 sm:px-6 lg:px-8"
          aria-label={lang === "en" ? "Real workflows" : "Praxis-Workflows"}
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
                  className="rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl"
                >
                  <p className="mb-3 text-xs font-semibold tracking-wider [color:var(--brand-text)] uppercase">
                    {s.role}
                  </p>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)] md:text-base">
                    {s.text}
                  </p>
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
        <TestimonialsSection lang={lang} />

        {/* Gradient transition: light Trust → dark Comparison spotlight */}
        <SectionTransition from="var(--tone-light-bg)" to="var(--tone-dark-bg)" height={72} />

        {/* Comparison table — Subsumio vs. other AI tools. Dark "spotlight" tone
            breaks the long light run and frames the differentiation moment; the
            dark scope carries AA-bright signal accents (green/rose/blue), unlike
            slate — so the ✓/✗ cells stay legible. */}
        <Section
          tone="dark"
          className="px-4 py-24 sm:px-6 lg:px-8"
          aria-label={lang === "en" ? "Comparison" : "Vergleich"}
        >
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.comparisonTitle} sub={t.comparisonSub} />
            <div className="overflow-x-auto">
              <table className="mt-10 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--mk-border)]">
                    <th className="py-3 pr-4 text-left font-semibold text-[color:var(--mk-text)]">
                      {lang !== "en" ? "Funktion" : "Feature"}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--brand-text)]">
                      Subsumio
                    </th>
                    <th className="py-3 pl-4 text-left font-semibold text-[color:var(--mk-text-subtle)]">
                      {lang !== "en" ? "Andere KI-Tools" : "Other AI tools"}
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
                          <Check
                            size={16}
                            className="mt-0.5 shrink-0 text-[color:var(--signal-green)]"
                            aria-hidden
                          />
                          {row.subsumio}
                        </span>
                      </td>
                      <td className="py-4 pl-4 text-[color:var(--mk-text-subtle)]">
                        <span className="inline-flex items-start gap-2">
                          <X
                            size={16}
                            className="mt-0.5 shrink-0 text-[color:var(--mk-text-subtle)] opacity-50"
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

        {/* Gradient transition: dark Comparison → light Pricing */}
        <SectionTransition from="var(--tone-dark-bg)" to="var(--tone-light-bg)" height={72} />

        {/* Pricing */}
        <Section
          tone="light"
          id="pricing"
          className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8"
          aria-label="Pricing"
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
        </Section>

        {/* FAQ — light band, clean flow into the dark CTA close */}
        <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8" aria-label="FAQ">
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.faqTitle} />
            <AnimatedFaqList items={t.faq} tone="light" />
          </motion.div>
        </Section>

        {/* Gradient transition: light FAQ → dark CTA */}
        <SectionTransition from="var(--tone-light-bg)" to="var(--tone-dark-bg)" height={80} />

        {/* Final CTA — clean, serious close with gradient depth */}
        <Section
          tone="dark"
          className="relative overflow-hidden px-4 py-24 text-center sm:px-6 lg:px-8"
          aria-label="Call to action"
        >
          <GradientMesh className="z-0" />
          <motion.div {...reveal} className="relative z-10 mx-auto max-w-3xl text-center">
            <SubsumioMark size={48} className="mx-auto mb-7" />
            <h2 className="mb-4 [font-family:var(--font-display)] text-[1.75rem] leading-[1.12] font-black tracking-[-0.02em] text-balance [color:var(--mk-text)] md:text-4xl">
              {t.ctaTitle}
            </h2>
            <p className="mb-10 text-base [color:var(--mk-text-muted)] md:text-lg">{t.ctaSub}</p>
            <MagneticButton strength={0.2}>
              <Link href={p(lang, "/signup")}>
                <Button size="xl" variant="primary">
                  {t.ctaButton} <ArrowRight size={18} />
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

        {/* Gradient transition: dark CTA → footer */}
        <SectionTransition from="var(--tone-dark-bg)" to="var(--tone-dark-surface)" height={60} />

        {/* Sticky CTA bar — appears after hero scroll (legal SaaS best practice) */}
        <motion.div
          initial={false}
          animate={{
            opacity: stickyVisible ? 1 : 0,
            y: stickyVisible ? 0 : 60,
            pointerEvents: stickyVisible ? "auto" : "none",
          }}
          transition={{ duration: 0.3, ease: EASE.out }}
          data-tone="dark"
          className="fixed right-0 bottom-0 left-0 z-50 border-t [border-color:var(--mk-border)] backdrop-blur-lg [background:color-mix(in_srgb,var(--mk-surface)_92%,transparent)]"
          aria-hidden={!stickyVisible}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <SubsumioMark size={24} />
              <span className="text-sm font-semibold [color:var(--mk-text)]">
                {lang !== "en" ? "Subsumio testen" : "Try Subsumio"}
              </span>
              <span className="hidden text-xs [color:var(--mk-text-subtle)] sm:inline">
                {lang !== "en"
                  ? "14 Tage gratis · Keine Kreditkarte"
                  : "14 days free · No credit card"}
              </span>
            </div>
            <Link href={p(lang, "/signup")}>
              <Button size="md" variant="primary">
                {t.ctaPrimary} <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </>
  );
}
