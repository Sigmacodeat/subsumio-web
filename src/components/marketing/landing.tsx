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
import { LANDING, UI_STRINGS, p } from "@/content/site";
import { professionalPricing } from "@/content/audiences";
import { PricingGrid } from "./pricing-grid";
import { TestimonialsSection } from "./testimonials";
import AudienceTabs from "./audience-tabs";
import LandingHero from "./landing-hero";
import StickyCta from "./sticky-cta";
import { Section, SectionHeading, StatCard } from "./primitives";
import { H2_CTA_CLASS, H3_CLASS } from "./typography";
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
import ProductWorkflowShowcase from "./product-workflow-showcase";
import LogoMarquee from "./logo-marquee";

const PAIN_ICONS = [ICONS.Search, ICONS.AlertTriangle, ICONS.FileClock, ICONS.Users];

export default function LandingPage() {
  const t = LANDING;
  const pricing = professionalPricing();
  const ui = UI_STRINGS;

  return (
    <>
      <ScrollProgress />
      {/* overflow-x-CLIP (not -hidden): `hidden` forces overflow-y to `auto`,
          turning this wrapper into a scroll container that would break any
          `position: sticky` descendant. `clip` clips the horizontal
          marquee/parallax overflow without establishing a scroll container. */}
      <div data-tone="light" className="min-h-screen overflow-x-clip" lang="de-AT">
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
            <Reveal variant="upScale" className="mx-auto max-w-5xl">
              <SectionHeading
                title={(t as { painTitle: string }).painTitle}
                sub={(t as { painSub: string }).painSub}
              />
              <StaggerContainer
                className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2"
                stagger={0.08}
              >
                {(t as { pains: { value: string; label: string }[] }).pains.map((pain, i) => {
                  const Icon = PAIN_ICONS[i];
                  return (
                    <StaggerItem key={pain.label}>
                      <div className="group relative h-full overflow-hidden rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl motion-reduce:transition-none">
                        {/* Top accent — category-rose into brand-primary */}
                        <div
                          aria-hidden
                          className="absolute inset-x-0 top-0 h-1"
                          style={{
                            background:
                              "linear-gradient(90deg, var(--ds-category-rose-text), var(--brand-primary) 70%)",
                          }}
                        />
                        <div
                          className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border ${accentTile("rose", "light")}`}
                        >
                          {Icon && <Icon size={22} />}
                        </div>
                        <p className="mb-2 text-3xl font-bold tracking-tight text-balance [color:var(--brand-text)] md:text-4xl">
                          {pain.value}
                        </p>
                        <p className="text-sm leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-base">
                          {pain.label}
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

        {/* Features — what it does (directly after Pain, solution = benefits) */}
        <Section
          tone="light"
          id="features"
          className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8"
          aria-label={ui.ariaFeatures}
        >
          <div className="mx-auto max-w-7xl">
            <Reveal variant="upScale">
              <SectionHeading badge="Features" title={t.featuresTitle} sub={t.featuresSub} />
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
                      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border [border-color:var(--mk-border)] p-6 [box-shadow:var(--mk-card-shadow)] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
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

        {/* How it works — animated scroll-driven workflow showcase.
            The single product visual on the page: one strong demo beats
            three stacked showcases (scroll fatigue on a long page). */}
        <ProductWorkflowShowcase industry="legal" />

        {/* WhatsApp Copilot — dark spotlight with phone mockup */}
        <WhatsAppSpotlight>
          <Button size="lg" variant="primary" asChild>
            <Link href={p("/whatsapp")}>
              {UI_STRINGS.whatsappDetail} <ArrowRight size={16} />
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
            <SectionHeading badge="Pricing" title={pricing.title} sub={pricing.sub} />
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
                <Link href={p("/superbrain")}>{UI_STRINGS.watchDemo}</Link>
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
            {t.relatedLinks && (
              <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
                {t.relatedLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-[color:var(--mk-text-subtle)] underline decoration-[color:var(--mk-border)] underline-offset-4 transition-[background-color,border-color,color] hover:text-[color:var(--mk-text)] hover:decoration-[color:var(--brand-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}
          </Reveal>
        </Section>

        <StickyCta />
      </div>
    </>
  );
}
