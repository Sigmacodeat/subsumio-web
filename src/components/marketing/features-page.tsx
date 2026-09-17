// Features page — Server Component composer. Sections: animated
// knowledge-graph hero (client island) · count-up stats band ·
// interactive category explorer · "everything at a glance" grid · CTA.
// All hook-driven pieces live in ./features-interactive.tsx; the static
// sections render server-side inside serializable motion islands.

import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, UI_STRINGS } from "@/content/site";
import { FEATURES_PAGE } from "@/content/features";
import { PROOF } from "@/content/proof-points";
import SubsumioShowcase from "./subsumio-showcase";
import { PageHero, SectionHeading, CTASection, Section } from "./primitives";
import { AnimatedFaqList } from "./animated-faq";
import {
  GraphHero,
  HowItWorks,
  FeatureCommandCenter,
  CategoryExplorer,
} from "./features-interactive";
import { AnimatedCounter, Reveal, StaggerContainer, StaggerItem } from "./motion-system";

export default function FeaturesPage() {
  const t = FEATURES_PAGE;

  // One documented figure only — everything else was unsourced and removed.
  const stats = [
    {
      to: PROOF.recall8.numeric,
      dec: PROOF.recall8.decimals,
      prefix: "",
      suffix: " %",
      label: PROOF.recall8.label,
    },
  ];

  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      {/* Hero — copy left, animated graph right */}
      <PageHero
        badge={t.badge}
        h1a={t.h1a}
        h1b={t.h1b}
        sub={t.sub}
        accentVariant="gradient-premium"
        actions={
          <>
            <Button size="lg" variant="primary" asChild>
              <Link href={p("/signup")}>
                {t.ctaButton} <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={p("/superbrain")}>
                {UI_STRINGS.watchDemo} <ArrowRight size={16} />
              </Link>
            </Button>
          </>
        }
        visual={
          <div className="relative">
            <div className="brand-soft absolute inset-0 rounded-full blur-3xl" />
            <div className="glass relative rounded-3xl p-6 shadow-2xl shadow-black/40">
              <GraphHero />
              <p className="mt-2 text-center font-mono text-sm [color:var(--mk-text-subtle)]">
                {UI_STRINGS.featuresGraphCaption}
              </p>
            </div>
          </div>
        }
      />

      {/* Stats band */}
      <Section tone="light" className="px-4 pb-20 sm:px-6 lg:px-8">
        <StaggerContainer className="mx-auto grid max-w-2xl grid-cols-1 gap-6" stagger={0.08}>
          {stats.map((s) => (
            <StaggerItem
              key={s.label}
              className="rounded-2xl border [border-color:var(--mk-border)] p-6 text-center transition-[background-color,border-color,color] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)] motion-reduce:transition-none"
            >
              <div className="gradient-text mb-1 text-3xl font-bold md:text-4xl">
                {s.prefix ?? ""}
                <AnimatedCounter to={s.to} decimals={s.dec} suffix={s.suffix ?? ""} />
              </div>
              <p className="text-sm leading-snug [color:var(--mk-text-muted)]">{s.label}</p>
              <Link
                href={p("/benchmark-methodology")}
                className="brand-text mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              >
                So wurde gemessen <ArrowRight size={14} />
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </Section>

      {/* How it works — four sequential steps */}
      <HowItWorks />

      <FeatureCommandCenter />

      {/* On the Subsumio brand: the comprehensive law-firm feature set
            (WhatsApp assistant spotlight + the full capability bento). */}
      <SubsumioShowcase />

      <CategoryExplorer />

      {/* Security cross-link — replaces former Security & Teams category */}
      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <Reveal variant="up">
          <div className="brand-border relative overflow-hidden rounded-3xl border p-8 text-center [background:var(--mk-surface)] md:p-12">
            <div className="brand-soft absolute inset-0 opacity-30 blur-3xl" />
            <div className="relative">
              <div className="brand-soft brand-border mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border">
                <Shield size={24} className="brand-text" />
              </div>
              <SectionHeading
                title={UI_STRINGS.featuresSecurityTitle}
                sub={UI_STRINGS.featuresSecuritySub}
              />
              <Button size="lg" variant="secondary" asChild>
                <Link href={p("/security")}>
                  {UI_STRINGS.exploreSecurity} <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* FAQ */}
      <Section tone="light" className="px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up" className="mb-10 text-center">
            <SectionHeading title={t.faqTitle} />
          </Reveal>
          <AnimatedFaqList items={t.faq} tone="light" />
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title={t.ctaTitle}
        sub={t.ctaSub}
        href={p("/signup")}
        label={t.ctaButton}
        secondaryHref={p("/contact")}
        secondaryLabel={UI_STRINGS.writeUs}
      />
    </div>
  );
}
