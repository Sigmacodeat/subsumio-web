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
import {
  ArrowRight,
  Check,
  X,
  CreditCard,
  Scale,
  Globe,
  ShieldCheck,
  BadgeCheck,
  FileCheck,
  Server,
  Play,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { LANDING, PRICING, UI_STRINGS, p, type Lang } from "@/content/site";
import { PricingGrid } from "./pricing-grid";
import ScrollPinnedDashboard from "./scroll-pinned-dashboard";
import { TestimonialsSection } from "./testimonials";
import AudienceTabs from "./audience-tabs";
import { Section, SectionHeading, ICONS, accentTile, H2_CTA_CLASS } from "./chrome";
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
import HeroQACard from "./hero-qa-card";
import RotatingBadge from "./rotating-badge";

const TRUST_ICONS: Record<string, LucideIcon> = {
  CreditCard,
  Scale,
  Globe,
  ShieldCheck,
  BadgeCheck,
  FileCheck,
  Server,
};

const PAIN_ICONS = [ICONS.Search, ICONS.AlertTriangle, ICONS.FileClock, ICONS.Users];

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
  const motifOpacity = useTransform(heroScrollProgress, [0, 0.8], [0.13, 0]);

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
        {/* Hero — split layout: messaging left, animated Q→A card right.
            Product-led storytelling: the visitor sees the product in action
            within 3 seconds, without scrolling. */}
        <Section
          tone="slate"
          noTopEdge
          className="relative overflow-hidden px-6 pt-28 pb-20 md:pt-32 md:pb-24"
        >
          {/* Legal icon constellation — subtle parallax background motif */}
          <motion.div
            style={{ y: motifY, opacity: motifOpacity }}
            className="absolute inset-0 z-0 hidden md:block"
          >
            <IndustryHeroMotif industry="legal" className="h-full w-full opacity-[1]" />
          </motion.div>

          {/* Split grid — 55/45 on lg+, stacked on mobile */}
          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[55fr_45fr]">
            {/* ─── Left column: messaging + CTAs ─── */}
            <div className="text-center lg:text-left">
              {/* Rotating badge — crossfades through 3 differentiators */}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.1 }
                }
                className="flex justify-center lg:justify-start"
              >
                <RotatingBadge items={t.heroBadges} />
              </motion.div>

              {/* H1 — bold (not black — Space Grotesk loads max 700) */}
              <h1
                className="mb-5 text-[clamp(2.5rem,7vw,4rem)] leading-[1.08] font-bold tracking-tight text-balance [color:var(--mk-text)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <SplitTextReveal as="span" delay={0.2} stagger={0.06} useAnimate className="block">
                  {`${t.h1a}\n${t.h1b}`}
                </SplitTextReveal>
              </h1>

              {/* Hero tagline — the outcome promise with gradient accent */}
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.35 }
                }
                className="mb-3 text-lg font-semibold md:text-xl"
                style={{
                  background: "linear-gradient(90deg, var(--brand-primary), var(--brand-tertiary))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t.heroTagline}
              </motion.p>

              {/* Sub-paragraph — 1 sentence, ≤160 chars */}
              <motion.div
                initial={reduce ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.45 }
                }
              >
                <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg lg:mx-0">
                  {t.sub}
                </p>
              </motion.div>

              {/* CTAs — primary dominant, secondary ghost, tertiary text link */}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.out, delay: 0.55 }
                }
                className="mb-6 flex flex-col items-center gap-3 sm:flex-row lg:items-start"
              >
                <MagneticButton strength={0.35}>
                  <Link href={p(lang, "/signup")}>
                    <Button size="xl" variant="primary" className="min-w-[220px]">
                      {t.ctaPrimary} <ArrowRight size={18} />
                    </Button>
                  </Link>
                </MagneticButton>
                <Link href="#pricing" className="inline-flex">
                  <Button size="lg" variant="ghost">
                    {ui.seePlans} <ArrowRight size={16} />
                  </Button>
                </Link>
              </motion.div>

              {/* Tertiary — scroll to demo */}
              <motion.div
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.out, delay: 0.65 }
                }
                className="mb-8 flex justify-center lg:justify-start"
              >
                <a
                  href="#features"
                  className="inline-flex items-center gap-1.5 text-sm font-medium [color:var(--mk-text-muted)] transition-colors hover:text-[var(--brand-text)]"
                >
                  <Play size={14} />
                  {ui.watchDemo}
                </a>
              </motion.div>

              {/* Trust pills — icon + text, staggered */}
              <motion.div
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.dramatic, delay: 0.75 }
                }
                className="flex flex-wrap justify-center gap-3 lg:justify-start"
              >
                {t.heroTrustItems.map((item, i) => {
                  const Icon = TRUST_ICONS[item.icon] ?? Check;
                  return (
                    <motion.span
                      key={item.label}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        reduce
                          ? { duration: 0 }
                          : { delay: 0.8 + i * 0.08, duration: 0.3, ease: EASE.out }
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 text-xs [color:var(--mk-text-muted)] [background:var(--mk-surface)]"
                    >
                      <Icon size={12} className="text-[var(--brand-secondary)]" />
                      {item.label}
                    </motion.span>
                  );
                })}
              </motion.div>
            </div>

            {/* ─── Right column: animated Q→A card ─── */}
            <div className="relative">
              <HeroQACard
                question={t.heroQACard.question}
                answer={t.heroQACard.answer}
                sources={t.heroQACard.sources}
                confidenceLabel={t.heroQACard.confidenceLabel}
                lang={lang}
              />
            </div>
          </div>

          {/* Trust strip — 5 badges with gradient divider, hero closing → marquee transition */}
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 1 }}
            className="relative z-10 mx-auto mt-12 max-w-4xl pt-8"
          >
            {/* gradient divider — fades from transparent to border to transparent */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--mk-border-strong) 20%, var(--mk-border-strong) 80%, transparent)",
              }}
            />
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {t.trustStripItems.map((item) => {
                const Icon = TRUST_ICONS[item.icon] ?? ShieldCheck;
                return (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 text-xs font-medium [color:var(--mk-text-muted)] transition-colors hover:[color:var(--mk-text)]"
                  >
                    <Icon size={14} className="text-[var(--brand-secondary)]" />
                    {item.label}
                  </span>
                );
              })}
            </div>
          </motion.div>
        </Section>

        {/* Logo Marquee — certifications & integrations sliding from right to left */}
        <LogoMarquee lang={lang} />

        {/* Pain + Stats — merged: cost of inaction, then proof metrics in one section. */}
        {"pains" in t && t.pains && (
          <Section
            tone="light"
            className="px-4 py-24 sm:px-6 lg:px-8"
            aria-label={ui.ariaCostOfInaction}
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
                {(t as { pains: { value: string; label: string }[] }).pains.map((p, i) => {
                  const Icon = PAIN_ICONS[i];
                  return (
                    <StaggerItem key={p.label}>
                      <div className="group relative h-full overflow-hidden rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl">
                        {/* Top accent — signal-rose into brand-primary */}
                        <div
                          aria-hidden
                          className="absolute inset-x-0 top-0 h-1"
                          style={{
                            background:
                              "linear-gradient(90deg, var(--signal-rose), var(--brand-primary) 70%)",
                          }}
                        />
                        <div
                          className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border ${accentTile("rose", "light")}`}
                        >
                          {Icon && <Icon size={22} />}
                        </div>
                        <p className="mb-2 text-3xl font-bold tracking-tight text-balance [color:var(--brand-text)] md:text-4xl">
                          {p.value}
                        </p>
                        <p className="text-sm leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-base">
                          {p.label}
                        </p>
                      </div>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>

              {/* Proof stats — directly below pain, same section */}
              <StaggerContainer
                className="mt-14 grid grid-cols-2 gap-8 text-center md:grid-cols-4"
                stagger={0.09}
              >
                {t.stats.map((stat) => {
                  const num = parseFloat(stat.value.replace(/[^0-9.]/g, ""));
                  const suffix = stat.value.replace(/[0-9.,]/g, "");
                  const prefix = stat.value.match(/^[^0-9]*/)?.[0] ?? "";
                  const isNumeric = !isNaN(num) && num > 0;
                  return (
                    <StaggerItem key={stat.label}>
                      <p className="mb-1 text-4xl font-bold [color:var(--brand-text)] md:text-5xl">
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

              {(t as { statsNote?: string }).statsNote && (
                <motion.p
                  {...reveal}
                  className="mx-auto mt-8 max-w-2xl text-center text-sm [color:var(--mk-text-subtle)]"
                >
                  {(t as { statsNote: string }).statsNote}
                </motion.p>
              )}
            </motion.div>
          </Section>
        )}

        {/* Features — what it does (directly after Pain, solution = benefits) */}
        <Section
          tone="light"
          id="features"
          className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8"
          aria-label={ui.ariaFeatures}
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

        {/* Audience segments — early relevance: "this is for my firm type" */}
        <AudienceTabs lang={lang} />

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

        {/* WhatsApp Copilot — dark spotlight with phone mockup */}
        <WhatsAppSpotlight lang={lang}>
          <Link href={p(lang, "/whatsapp")}>
            <Button size="lg" variant="primary">
              {UI_STRINGS[lang].whatsappDetail} <ArrowRight size={16} />
            </Button>
          </Link>
        </WhatsAppSpotlight>

        {/* Testimonials — social proof from real lawyers */}
        <TestimonialsSection lang={lang} />

        {/* Comparison table — Subsumio vs. other AI tools. Dark "spotlight" tone
            breaks the long light run and frames the differentiation moment; the
            dark scope carries AA-bright signal accents (green/rose/blue), unlike
            slate — so the ✓/✗ cells stay legible. */}
        <Section tone="dark" className="px-4 py-24 sm:px-6 lg:px-8" aria-label={ui.ariaComparison}>
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.comparisonTitle} sub={t.comparisonSub} />
            <div className="overflow-x-auto">
              <table
                className="mt-10 w-full border-collapse text-sm"
                aria-label={ui.comparisonTableLabel}
              >
                <thead>
                  <tr className="border-b border-[color:var(--mk-border)]">
                    <th className="py-3 pr-4 text-left font-semibold text-[color:var(--mk-text)]">
                      {ui.comparisonFeature}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--brand-text)]">
                      Subsumio
                    </th>
                    <th className="py-3 pl-4 text-left font-semibold text-[color:var(--mk-text-subtle)]">
                      {ui.comparisonOthers}
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

        {/* Pricing */}
        <Section
          tone="light"
          id="pricing"
          className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8"
          aria-label={ui.ariaPricing}
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
        <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8" aria-label={ui.ariaFaq}>
          <motion.div {...reveal} className="mx-auto max-w-5xl">
            <SectionHeading title={t.faqTitle} />
            <AnimatedFaqList items={t.faq} tone="light" />
          </motion.div>
        </Section>

        {/* Final CTA — clean, serious close with gradient depth */}
        <Section
          tone="dark"
          className="relative overflow-hidden px-4 py-24 text-center sm:px-6 lg:px-8"
          aria-label={ui.ariaCta}
        >
          <GradientMesh className="z-0" />
          <motion.div {...reveal} className="relative z-10 mx-auto max-w-3xl text-center">
            <SubsumioMark size={48} className="mx-auto mb-6" />
            <h2 className={`${H2_CTA_CLASS} mb-4`}>{t.ctaTitle}</h2>
            <p className="mb-10 text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
              {t.ctaSub}
            </p>
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
              <span className="text-sm font-semibold [color:var(--mk-text)]">{ui.trySubsumio}</span>
              <span className="hidden text-xs [color:var(--mk-text-subtle)] sm:inline">
                {ui.trialDaysFree}
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
