// Subsumio landing page — Server Component composer. The hook-driven pieces
// (hero parallax, sticky CTA) are client islands in ./landing-hero.tsx and
// ./sticky-cta.tsx; every other section is server-rendered JSX wrapped in
// client motion islands (Reveal/StaggerContainer/Section) whose props stay
// serializable. Typography constants come from ./typography (pure module) —
// importing string exports from a client module would stringify a client
// reference instead of the class list.

import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { contentFor, pBind, type Market } from "@/lib/market";
import { professionalPricing } from "@/content/audiences";
import { PricingGrid } from "./pricing-grid";
import { TestimonialsSection } from "./testimonials";
import ScrollStory from "./scroll-story";
import AudienceTabs from "./audience-tabs";
import LandingHero from "./landing-hero";
import StickyCta from "./sticky-cta";
import { Section, SectionHeading, StatCard } from "./primitives";
import { H2_CTA_CLASS, H3_CLASS, EYEBROW_CLASS } from "./typography";
import { ICONS, accentTile } from "./icons";
import { AnimatedFaqList } from "./animated-faq";
import {
  Reveal,
  StaggerContainer,
  StaggerItem,
  MagneticButton,
  ScrollProgress,
  GradientMesh,
} from "./motion-system";
import { WhatsAppSpotlight } from "./subsumio-showcase";
import LogoMarquee from "./logo-marquee";

const PAIN_ICONS = [ICONS.Search, ICONS.AlertTriangle, ICONS.FileClock, ICONS.Users];

export default function LandingPage({ market = "at" }: { market?: Market }) {
  const { landing: t, ui } = contentFor(market);
  const p = pBind(market);
  const pricing = professionalPricing();

  return (
    <>
      <ScrollProgress />
      {/* overflow-x-CLIP (not -hidden): `hidden` forces overflow-y to `auto`,
          turning this wrapper into a scroll container that would break any
          `position: sticky` descendant. `clip` clips the horizontal
          marquee/parallax overflow without establishing a scroll container. */}
      <div
        data-tone="light"
        className="min-h-screen overflow-x-clip"
        lang={market === "de" ? "de-DE" : "de-AT"}
      >
        <LandingHero />

        {/* Logo Marquee — certifications & integrations sliding from right to left */}
        <LogoMarquee />

        {/* Pain + Stats — merged: cost of inaction, then proof metrics in one section. */}
        {"pains" in t && t.pains && (
          <Section
            tone="light"
            className="px-4 py-24 sm:px-6 lg:px-8"
            aria-label={ui.ariaCostOfInaction}
          >
            <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
              {/* Left: the question, held in place while the answers scroll by */}
              <Reveal variant="upScale" className="lg:sticky lg:top-28 lg:self-start">
                <p className={`mb-5 ${EYEBROW_CLASS}`}>Ausgangslage</p>
                <h2 className={`mb-5 ${H2_CTA_CLASS}`}>{(t as { painTitle: string }).painTitle}</h2>
                <p className="max-w-md text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
                  {(t as { painSub: string }).painSub}
                </p>
              </Reveal>
              {/* Right: a numbered register — editorial, no card chrome */}
              <StaggerContainer
                as="ol"
                className="border-t [border-color:var(--mk-border)]"
                stagger={0.08}
              >
                {(t as { pains: { value: string; label: string }[] }).pains.map((pain, i) => {
                  const Icon = PAIN_ICONS[i];
                  return (
                    <StaggerItem
                      as="li"
                      key={pain.label}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-5 border-b [border-color:var(--mk-border)] py-7 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:py-8"
                    >
                      <span className="pt-1 font-mono text-sm [color:var(--mk-text-subtle)] tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="mb-2 text-xl leading-tight font-semibold tracking-[-0.012em] text-balance [color:var(--mk-text)] md:text-2xl">
                          {pain.value}
                        </h3>
                        <p className="max-w-xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                          {pain.label}
                        </p>
                      </div>
                      {Icon && (
                        <Icon
                          size={22}
                          aria-hidden
                          className="mt-1 hidden [color:var(--brand-text)] opacity-70 md:block"
                        />
                      )}
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            </div>

            <Reveal variant="upScale" className="mx-auto max-w-6xl">
              {/* Proof stats — directly below pain, same section */}
              <StaggerContainer
                className="mt-20 grid grid-cols-2 gap-x-8 gap-y-12 text-center md:grid-cols-4"
                stagger={0.09}
              >
                {t.stats.map((stat, i) => (
                  <StaggerItem key={stat.label}>
                    <div
                      className={`relative ${i > 0 ? "md:before:absolute md:before:top-1/2 md:before:left-0 md:before:h-12 md:before:w-px md:before:-translate-y-1/2 md:before:[background:var(--mk-border)]" : ""}`}
                    >
                      <StatCard value={stat.value} label={stat.label} />
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>

              {(t as { statsNote?: string }).statsNote && (
                <Reveal
                  variant="upScale"
                  as="p"
                  className="mx-auto mt-8 max-w-2xl text-center text-sm [color:var(--mk-text-subtle)]"
                >
                  {(t as { statsNote: string }).statsNote}
                </Reveal>
              )}
            </Reveal>
          </Section>
        )}

        {/* Product story — pinned visual driven by scroll. Comes after the pain:
            first what searching costs, then how Subsumio answers it. */}
        <ScrollStory />

        {/* Features — what it does (after the story: how it works, then what it covers) */}
        <Section
          tone="light"
          id="features"
          className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8"
          aria-label={ui.ariaFeatures}
        >
          <div className="mx-auto max-w-7xl">
            <Reveal variant="upScale">
              <SectionHeading badge="Funktionen" title={t.featuresTitle} sub={t.featuresSub} />
            </Reveal>
            <StaggerContainer
              className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
              stagger={0.07}
              y={16}
            >
              {t.features.map((f) => {
                const Icon = ICONS[f.icon];
                return (
                  <StaggerItem key={f.title}>
                    <Link
                      href={p("/features")}
                      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] [background:var(--mk-surface)] hover:-translate-y-0.5 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                    >
                      <div
                        className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border ${accentTile(f.color, "light")}`}
                      >
                        {Icon && <Icon size={22} />}
                      </div>
                      <h3 className={`mb-2 ${H3_CLASS}`}>{f.title}</h3>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)] md:text-base">
                        {f.desc}
                      </p>
                    </Link>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </Section>

        {/* Audience segments — early relevance: "this is for my firm type" */}
        <AudienceTabs />

        {/* Assistent auf WhatsApp — dark spotlight with phone mockup */}
        <WhatsAppSpotlight>
          <Button size="lg" variant="primary" asChild>
            <Link href={p("/whatsapp")}>
              {ui.whatsappDetail} <ArrowRight size={16} />
            </Link>
          </Button>
        </WhatsAppSpotlight>

        {/* Testimonials — social proof from real lawyers */}
        <TestimonialsSection />

        {/* Comparison table — Subsumio vs. other AI tools. Dark "spotlight" tone
            breaks the long light run and frames the differentiation moment; the
            dark scope carries AA-bright signal accents (green/rose/blue), unlike
            slate — so the ✓/✗ cells stay legible. */}
        <Section tone="dark" className="px-4 py-24 sm:px-6 lg:px-8" aria-label={ui.ariaComparison}>
          <Reveal variant="upScale" className="mx-auto max-w-5xl">
            <SectionHeading title={t.comparisonTitle} sub={t.comparisonSub} />
            {/* Mobile: stacked card layout */}
            <div className="mt-10 space-y-3 md:hidden">
              {t.comparison.map((row, i) => (
                <Reveal
                  variant="subtle"
                  delay={i * 0.05}
                  key={row.feature}
                  className="rounded-xl border border-[color:var(--mk-border)] p-4"
                >
                  <p className="mb-3 text-sm font-semibold text-[color:var(--mk-text)]">
                    {row.feature}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-sm font-semibold text-[color:var(--brand-text)]">
                        Subsumio
                      </p>
                      <span className="inline-flex items-start gap-1.5 text-sm text-[color:var(--mk-text-muted)]">
                        <Check
                          size={14}
                          className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
                          aria-hidden
                        />
                        {row.subsumio}
                      </span>
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-[color:var(--mk-text-subtle)]">
                        {ui.comparisonOthers}
                      </p>
                      <span className="inline-flex items-start gap-1.5 text-sm text-[color:var(--mk-text-subtle)]">
                        <X size={14} className="mt-0.5 shrink-0 opacity-50" aria-hidden />
                        {row.others}
                      </span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            {/* Desktop: table layout */}
            <div className="hidden overflow-x-auto md:block">
              <table
                className="mt-10 w-full border-collapse text-sm"
                aria-label={ui.comparisonTableLabel}
              >
                <thead>
                  <tr className="border-b border-[color:var(--mk-border)]">
                    <th className="py-3 pr-4 text-left font-semibold text-[color:var(--mk-text)]">
                      {ui.comparisonFeature}
                    </th>
                    <th className="brand-soft rounded-t-lg px-4 py-3 text-left font-semibold text-[color:var(--brand-text)]">
                      Subsumio
                    </th>
                    <th className="py-3 pl-4 text-left font-semibold text-[color:var(--mk-text-subtle)]">
                      {ui.comparisonOthers}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {t.comparison.map((row, i) => (
                    <Reveal
                      as="tr"
                      variant="subtle"
                      delay={i * 0.05}
                      key={row.feature}
                      className="border-b border-[color:var(--mk-border)] last:border-0"
                    >
                      <td className="py-4 pr-4 font-medium text-[color:var(--mk-text)]">
                        {row.feature}
                      </td>
                      <td className="brand-soft px-4 py-4 text-[color:var(--mk-text)]">
                        <span className="inline-flex items-start gap-2">
                          <Check
                            size={16}
                            className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
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
                    </Reveal>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </Section>

        {/* Pricing */}
        <Section
          tone="light"
          id="pricing"
          className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8"
          aria-label={ui.ariaPricing}
        >
          <Reveal variant="upScale" className="mx-auto max-w-6xl">
            <SectionHeading badge="Preise" title={pricing.title} sub={pricing.sub} />
            <PricingGrid />
            <div className="mt-10 text-center">
              <Button size="lg" variant="secondary" asChild>
                <Link href={p("/pricing")}>
                  {ui.seeFullPricing} <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          </Reveal>
        </Section>

        {/* FAQ — light band, clean flow into the dark CTA close */}
        <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8" aria-label={ui.ariaFaq}>
          <Reveal variant="upScale" className="mx-auto max-w-5xl">
            <SectionHeading title={t.faqTitle} />
            <AnimatedFaqList items={t.faq} tone="light" />
          </Reveal>
        </Section>

        {/* Final CTA — clean, serious close with gradient depth */}
        <Section
          tone="dark"
          className="relative overflow-hidden px-4 py-24 text-center sm:px-6 lg:px-8"
          aria-label={ui.ariaCta}
          data-closing-cta
        >
          <GradientMesh className="z-0" />
          <Reveal variant="upScale" className="relative z-10 mx-auto max-w-3xl text-center">
            <SubsumioMark size={48} className="mx-auto mb-6" />
            <h2 className={`${H2_CTA_CLASS} mb-4`}>{t.ctaTitle}</h2>
            <p className="mb-10 text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
              {t.ctaSub}
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <MagneticButton strength={0.2}>
                <Button size="xl" variant="primary" asChild>
                  <Link href={p("/signup")}>
                    {t.ctaButton} <ArrowRight size={18} />
                  </Link>
                </Button>
              </MagneticButton>
              <Button size="xl" variant="secondary" asChild>
                <Link href={p("/superbrain")}>{ui.watchDemo}</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm [color:var(--mk-text-subtle)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[color:var(--ds-success-text)]" />
                {ui.noCreditCard}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[color:var(--ds-success-text)]" />
                {ui.gdprReady}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-[color:var(--ds-success-text)]" />
                {ui.professionalSecrecy}
              </span>
            </div>
          </Reveal>
        </Section>

        <StickyCta />
      </div>
    </>
  );
}
